#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'https://767-2676.com';
export const EXA_MCP = 'https://mcp.exa.ai/mcp?tools=web_search_advanced_exa';
export const SEARCH = Object.freeze({
  query: 'POPCORN signed receipts temporal witness 767-2676.com',
  includeDomains: Object.freeze(['767-2676.com']), numResults: 3, type: 'auto',
});
const MAX_BYTES = 3 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function readBounded(response) {
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body ?? []) {
    length += chunk.byteLength;
    if (length > MAX_BYTES) throw new Error('Response exceeded the 3 MiB limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// MCP Streamable HTTP permits JSON or SSE. Stop once this request's response arrives.
export async function readRpc(response, id) {
  if (!response.ok) throw new Error(`Exa MCP HTTP ${response.status}`);
  if (response.status === 202 || response.status === 204) return null;
  let envelope;
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', length = 0;
    try {
      while (!envelope) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) throw new Error('Exa MCP response exceeded the 3 MiB limit');
        buffer += decoder.decode(value, { stream: true });
        let separator;
        while ((separator = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, separator.index);
          buffer = buffer.slice(separator.index + separator[0].length);
          const data = event.split(/\r?\n/).filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          const candidate = JSON.parse(data);
          if (candidate.id === id) { envelope = candidate; break; }
        }
      }
    } finally { await reader.cancel(); }
  } else {
    const body = (await readBounded(response)).toString('utf8');
    if (!body && id === undefined) return null;
    envelope = JSON.parse(body);
  }
  if (!envelope || envelope.id !== id) throw new Error('Exa MCP response ID mismatch');
  if (envelope.error) throw new Error(`Exa MCP error ${envelope.error.code ?? 'unknown'}`);
  if (!Object.hasOwn(envelope, 'result')) throw new Error('Exa MCP omitted result');
  return envelope.result;
}

export function normalizeSearch(result) {
  if (!result || !Array.isArray(result.results)) throw new Error('Exa response omitted search results');
  return {
    request_id: result.requestId ?? null,
    results: result.results.slice(0, 3).map(item => {
      let canonicalDomain = false;
      try { canonicalDomain = new URL(item.url).hostname === '767-2676.com'; } catch {}
      return {
        url: typeof item.url === 'string' ? item.url : null,
        title: typeof item.title === 'string' ? item.title : null,
        canonical_domain: canonicalDomain,
        excerpt: typeof item.text === 'string' ? item.text.slice(0, 1200) : null,
      };
    }),
  };
}

async function mcpSearch(fetchImpl) {
  let session, protocol = '2025-03-26', nextId = 1;
  async function rpc(method, params, notification = false) {
    const id = notification ? undefined : nextId++;
    const response = await fetchImpl(EXA_MCP, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'mcp-protocol-version': protocol, ...(session ? { 'mcp-session-id': session } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
    });
    session = response.headers.get('mcp-session-id') ?? session;
    return readRpc(response, id);
  }
  const init = await rpc('initialize', {
    protocolVersion: protocol, capabilities: {},
    clientInfo: { name: 'popcorn-agent-discovery', version: '0.1.0' },
  });
  if (typeof init.protocolVersion !== 'string') throw new Error('Exa MCP omitted protocol version');
  protocol = init.protocolVersion;
  await rpc('notifications/initialized', {}, true);
  const list = await rpc('tools/list', {});
  const tool = list.tools?.find(item => item.name === 'web_search_advanced_exa');
  if (!tool?.inputSchema?.properties?.includeDomains) throw new Error('Exa domain-filtered search is unavailable');
  const call = await rpc('tools/call', {
    name: tool.name,
    arguments: { ...SEARCH, textMaxCharacters: 1200, enableHighlights: false },
  });
  if (call.isError) throw new Error('Exa search tool returned an error');
  let result = call.structuredContent;
  if (!Array.isArray(result?.results)) {
    for (const part of call.content ?? []) {
      if (part.type !== 'text') continue;
      try {
        const parsed = JSON.parse(part.text);
        if (Array.isArray(parsed.results)) { result = parsed; break; }
      } catch {}
    }
  }
  return { ...normalizeSearch(result), server: init.serverInfo?.name ?? null };
}

async function restSearch(fetchImpl, apiKey) {
  if (!apiKey) throw new Error('--rest requires EXA_API_KEY');
  const response = await fetchImpl('https://api.exa.ai/search', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ ...SEARCH, contents: { text: { maxCharacters: 1200 } } }),
  });
  if (!response.ok) throw new Error(`Exa REST HTTP ${response.status}`);
  return normalizeSearch(JSON.parse((await readBounded(response)).toString('utf8')));
}

async function readCanonical(path, format, fetchImpl, now) {
  const url = `${ORIGIN}${path}`;
  const response = await fetchImpl(url, {
    method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { accept: format === 'json' ? 'application/json' : 'text/plain', 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  if (!response.ok) throw new Error(`Canonical ${path} HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes(format === 'json' ? 'application/json' : 'text/plain')) {
    throw new Error(`Canonical ${path} returned an unexpected content type`);
  }
  const bytes = await readBounded(response);
  if (!bytes.byteLength) throw new Error(`Canonical ${path} was empty`);
  const text = bytes.toString('utf8');
  return {
    url, retrieved_at: now(), bytes: bytes.byteLength, sha256: sha256(bytes),
    content_type: contentType, cache_control: response.headers.get('cache-control'),
    site_release: response.headers.get('x-popcorn-site-release'),
    text, ...(format === 'json' ? { document: JSON.parse(text) } : {}),
  };
}

export async function discover({ mode = 'mcp', apiKey, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  if (!['mcp', 'rest', 'direct'].includes(mode)) throw new Error('Unknown discovery mode');
  if (mode === 'rest' && !apiKey) throw new Error('--rest requires EXA_API_KEY');
  let search = { mode, status: mode === 'direct' ? 'skipped' : 'pending', query: SEARCH };
  if (mode !== 'direct') {
    try {
      search = { ...search, status: 'ok', ...(await (mode === 'mcp' ? mcpSearch(fetchImpl) : restSearch(fetchImpl, apiKey))) };
    } catch (error) {
      search = { ...search, status: 'unavailable', error: error.message };
    }
  }
  // Always read the current contract directly; never execute or adopt search snippets.
  const [instructions, catalog] = await Promise.all([
    readCanonical('/llms.txt', 'text', fetchImpl, now),
    readCanonical('/.well-known/ai-catalog.json', 'json', fetchImpl, now),
  ]);
  return {
    schema: 'popcorn-discovery/1.0', observed_at: now(), canonical_origin: ORIGIN,
    search, current: { instructions, catalog }, payment_sent: false,
    interpretation: 'Search results are discovery observations. Direct documents are the current public contract, not cryptographic evidence. No receipt was purchased or verified by this command.',
  };
}

export function summarize(report) {
  return { ...report, current: Object.fromEntries(Object.entries(report.current).map(([name, document]) => {
    const { text, document: body, ...metadata } = document;
    return [name, metadata];
  })) };
}

async function main() {
  let mode = 'mcp', output;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log('Usage: node discover.mjs [--direct | --rest] [--output report.json]\nDefault: free keyless Exa MCP. --rest uses EXA_API_KEY and may consume Exa credits.\n--output saves the full current documents; stdout contains metadata and observed search results.');
      return;
    }
    if (args[i] === '--direct' || args[i] === '--rest') {
      if (mode !== 'mcp') throw new Error('Choose one discovery mode');
      mode = args[i].slice(2);
    } else if (args[i] === '--output' && args[i + 1] && !args[i + 1].startsWith('--')) {
      output = args[++i];
    } else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const report = await discover({ mode, apiKey: mode === 'rest' ? process.env.EXA_API_KEY : undefined });
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ...summarize(report), ...(output ? { saved_report: resolve(output) } : {}) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
