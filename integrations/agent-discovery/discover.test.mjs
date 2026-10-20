import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { discover, EXA_MCP, ORIGIN, readRpc, summarize } from './discover.mjs';

const instructionText = 'True Witness Here\n\nCurrent whole document.\n';
const json = (value, headers = {}) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...headers } });
function canonical(url) {
  if (url === `${ORIGIN}/llms.txt`) return new Response(instructionText, { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-popcorn-site-release': 'test-release' } });
  if (url === `${ORIGIN}/.well-known/ai-catalog.json`) return json({ canonical_origin: ORIGIN });
  throw new Error(`Unexpected request ${url}`);
}
function mockMcp({ searchError = false, sse = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url !== EXA_MCP) return canonical(url);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['x-api-key'], undefined);
    const message = JSON.parse(init.body);
    if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    let result;
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', serverInfo: { name: 'exa-search-server' } };
    if (message.method === 'tools/list') result = { tools: [{ name: 'web_search_advanced_exa', inputSchema: { properties: { includeDomains: {} } } }] };
    if (message.method === 'tools/call') {
      assert.deepEqual(message.params.arguments.includeDomains, ['767-2676.com']);
      assert.equal(message.params.arguments.numResults, 3);
      result = searchError ? { isError: true } : { content: [{ type: 'text', text: JSON.stringify({ requestId: 'observed-request', results: [{ url: `${ORIGIN}/demo`, title: 'Old title', text: 'Old excerpt' }] }) }] };
    }
    const envelope = { jsonrpc: '2.0', id: message.id, result };
    return sse
      ? new Response(`: ping\n\nevent: message\ndata: ${JSON.stringify(envelope)}\n\n`, { headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'test-session' } })
      : json(envelope, { 'mcp-session-id': 'test-session' });
  };
  return { calls, fetchImpl };
}

test('keyless search records results and always reads complete canonical documents', async () => {
  const { calls, fetchImpl } = mockMcp();
  const result = await discover({ fetchImpl, apiKey: 'must-not-be-used', now: () => '2026-10-20T00:00:00.000Z' });
  assert.equal(result.search.status, 'ok');
  assert.equal(result.search.results[0].canonical_domain, true);
  assert.equal(result.current.instructions.text, instructionText);
  assert.equal(result.current.instructions.sha256, createHash('sha256').update(instructionText).digest('hex'));
  assert.equal(result.current.catalog.sha256, createHash('sha256').update(result.current.catalog.text).digest('hex'));
  assert.equal(result.current.instructions.retrieved_at, '2026-10-20T00:00:00.000Z');
  assert.equal(result.payment_sent, false);
  assert.equal(calls.length, 6);
  assert.ok(calls.every(({ url }) => !url.includes('/v1/time') && !url.includes('/v2/receipt')));
  for (const { init } of calls.filter(({ url }) => url.startsWith(ORIGIN))) {
    assert.equal(init.method, 'GET');
    assert.equal(init.headers['cache-control'], 'no-cache');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
  }
  assert.equal(JSON.stringify(calls).includes('must-not-be-used'), false);
});

test('SSE MCP transport negotiates session and parses tool result', async () => {
  const { fetchImpl, calls } = mockMcp({ sse: true });
  const result = await discover({ fetchImpl });
  assert.equal(result.search.status, 'ok');
  assert.equal(calls[1].init.headers['mcp-session-id'], 'test-session');
  assert.equal(calls[1].init.headers['mcp-protocol-version'], '2025-03-26');
});

test('search failure still yields fresh documents without authenticated retry', async () => {
  const { calls, fetchImpl } = mockMcp({ searchError: true });
  const result = await discover({ fetchImpl, apiKey: 'unused' });
  assert.equal(result.search.status, 'unavailable');
  assert.equal(result.current.instructions.text, instructionText);
  assert.equal(calls.length, 6);
});

test('direct mode makes only two free GET requests', async () => {
  const calls = [];
  const result = await discover({ mode: 'direct', fetchImpl: async (url, init) => { calls.push({ url, init }); return canonical(url); } });
  assert.equal(result.search.status, 'skipped');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ init }) => init.method === 'GET'));
  assert.equal(summarize(result).current.instructions.text, undefined);
  assert.equal(summarize(result).current.catalog.document, undefined);
});

test('REST mode requires explicit credentials before any network request', async () => {
  await assert.rejects(discover({ mode: 'rest', fetchImpl: () => assert.fail('network called') }), /requires EXA_API_KEY/);
});

test('REST request uses exact domain and never passes key to canonical site', async () => {
  let count = 0;
  const result = await discover({ mode: 'rest', apiKey: 'test-only', fetchImpl: async (url, init) => {
    count++;
    if (url === 'https://api.exa.ai/search') {
      assert.equal(init.headers['x-api-key'], 'test-only');
      assert.deepEqual(JSON.parse(init.body).includeDomains, ['767-2676.com']);
      return json({ results: [] });
    }
    assert.equal(init.headers['x-api-key'], undefined);
    return canonical(url);
  } });
  assert.equal(result.search.status, 'ok');
  assert.equal(count, 3);
});

test('canonical wrong content type, HTTP errors and oversized documents fail', async () => {
  for (const response of [new Response('<html>oops</html>', { headers: { 'content-type': 'text/html' } }), new Response('unavailable', { status: 503 }), new Response('x'.repeat(3 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/plain' } })]) {
    await assert.rejects(discover({ mode: 'direct', fetchImpl: async url => url.endsWith('/llms.txt') ? response : canonical(url) }));
  }
});

test('MCP rejects unrelated IDs and JSON-RPC errors', async () => {
  await assert.rejects(readRpc(json({ id: 2, result: {} }), 1), /ID mismatch/);
  await assert.rejects(readRpc(json({ id: 1, error: { code: -32600 } }), 1), /-32600/);
});

test('SSE handles CRLF and UTF-8 split across transport chunks', async () => {
  const bytes = new TextEncoder().encode('event: message\r\ndata: {"id":1,"result":{"title":"caf\u00e9"}}\r\n\r\n');
  const body = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  const result = await readRpc(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), 1);
  assert.deepEqual(result, { title: 'caf\u00e9' });
});
