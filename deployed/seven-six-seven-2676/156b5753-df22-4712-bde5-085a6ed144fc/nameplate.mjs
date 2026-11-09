// Presentation only. This module never parses or rewrites a signed receipt,
// catalog, schema, protocol field, historical sample, license, or SVG.
export const NAMEPLATE = 'True Witness Here';
export const NAMEPLATE_HEADER = 'x-popcorn-nameplate';
export const NAMEPLATE_HTML = '<header id="popcorn-true-witness-nameplate" aria-label="Service nameplate"><small><strong>True Witness Here</strong></small></header>';
const ORIGIN = 'https://767-2676.com';
const LIMIT = 2 * 1024 * 1024;

// Current authored prose only. A filename ending in .md is not sufficient:
// the two scoped task-time SKILL aliases below have a catalog-pinned digest.
export const AUTHORED_MARKDOWN_PATHS = Object.freeze([
  '/', '/agent-entry', '/agents', '/pricing', '/terms', '/time', '/briarwood',
  '/SKILL.md', '/llms.txt', '/auth.md', '/.well-known/auth.md',
  '/agents.md', '/agent-entry.md', '/agent-entry/policy.md', '/agent-revisions.md',
  '/signal.md', '/prove-action-before-authorization-expired',
  '/prove-action-before-authorization-expired.md', '/checkpoint/CLIENT.md',
]);
const markdownPaths = new Set(AUTHORED_MARKDOWN_PATHS);
export const PINNED_SKILL_PATHS = Object.freeze([
  '/skills/task-time/SKILL.md',
  '/.well-known/agent-skills/popcorn-task-time/SKILL.md',
]);
const pinnedSkills = new Set(PINNED_SKILL_PATHS);
const immutablePath = path => pinnedSkills.has(path) ||
  path === '/lab-record' || path === '/lab-record/' ||
  /^\/(?:examples|samples|schemas|license)(?:\/|$)/.test(path) ||
  /^\/schedule\/example(?:\/|\.|$)/.test(path) ||
  /^\/(?:historical|history|archive|archives)(?:\/|$)/.test(path);
const documentType = type => type === 'text/html' || type === 'text/markdown' || type === 'text/plain' || type === 'application/json' || type.endsWith('+json');

function transformation(path, response, method) {
  if (!['GET', 'HEAD'].includes(method) || response.headers.has('content-range') ||
      /\battachment\b/i.test(response.headers.get('content-disposition') || '')) return 'untouched';
  const fullType = response.headers.get('content-type') || '';
  const type = fullType.split(';', 1)[0].trim().toLowerCase();
  if (type === 'image/svg+xml' || /\.svg$/i.test(path)) return 'untouched';
  if (!documentType(type)) return 'untouched';
  // These responses retain their exact bodies; only an HTTP nameplate is added.
  if (type === 'application/json' || type.endsWith('+json') || immutablePath(path)) return 'header';
  if (/\bimmutable\b|\bno-transform\b/i.test(response.headers.get('cache-control') || '') ||
      (response.headers.get('content-encoding') && response.headers.get('content-encoding').toLowerCase() !== 'identity') ||
      (/;\s*charset\s*=\s*[^;]+/i.test(fullType) && !/;\s*charset\s*=\s*["']?utf-8["']?(?:\s*;|\s*$)/i.test(fullType))) return 'header';
  if (type === 'text/html') return 'html';
  if (markdownPaths.has(path) && (type === 'text/markdown' || type === 'text/plain')) return 'markdown';
  return 'header';
}

// Locate an actual tag outside comments, quoted attributes, raw-text elements,
// and templates. A '<body>' string inside a script is never an insertion point.
function htmlInsertionPoint(html) {
  let offset = 0, raw = null, templateDepth = 0, inHead = false;
  const headTags = new Set(['html', 'head', 'base', 'basefont', 'bgsound', 'link', 'meta', 'title', 'noscript', 'noframes', 'style', 'script', 'template']);
  const rawTags = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
  while (offset < html.length) {
    if (raw) {
      const expression = new RegExp('</' + raw + '\\s*[^>]*>', 'ig');
      expression.lastIndex = offset;
      const closing = expression.exec(html);
      if (!closing) return null;
      offset = expression.lastIndex; raw = null; continue;
    }
    const start = html.indexOf('<', offset);
    if (start < 0) return null;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4); if (end < 0) return null;
      offset = end + 3; continue;
    }
    let end = start + 1, quote = null;
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= html.length) return null;
    const token = html.slice(start, end + 1);
    const parsed = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)(?=[\s/>])/.exec(token);
    offset = end + 1;
    if (!parsed) continue;
    const closing = parsed[1] === '/', name = parsed[2].toLowerCase();
    if (name === 'template') { templateDepth += closing ? -1 : 1; templateDepth = Math.max(0, templateDepth); continue; }
    if (templateDepth) { if (!closing && rawTags.has(name)) raw = name; continue; }
    if (name === 'head') { inHead = !closing; continue; }
    if (!closing && name === 'body') return end + 1;
    if (!closing && !inHead && !headTags.has(name)) return start; // implicit body, e.g. /try
    if (!closing && rawTags.has(name)) raw = name;
  }
  return null;
}

function insertHtml(html) {
  if (html.includes(NAMEPLATE_HTML)) return html;
  const point = htmlInsertionPoint(html);
  return point === null ? html : html.slice(0, point) + NAMEPLATE_HTML + html.slice(point);
}

function insertMarkdown(body) {
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const plate = '> **' + NAMEPLATE + '**' + newline + newline;
  let point = body.charCodeAt(0) === 0xFEFF ? 1 : 0;
  if (/^---(?:\r?\n)/.test(body.slice(point))) {
    const firstLine = body.indexOf('\n', point) + 1;
    const rest = body.slice(firstLine);
    const closing = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/m.exec(rest);
    if (!closing) return body; // never corrupt an incomplete YAML header
    point = firstLine + closing.index + closing[0].length;
    if (point === body.length && !body.endsWith('\n')) return body + newline + plate;
  }
  if (body.slice(point).startsWith(plate)) return body;
  return body.slice(0, point) + plate + body.slice(point);
}

async function utf8Body(response) {
  if (Number(response.headers.get('content-length')) > LIMIT || !response.body) return null;
  const reader = response.clone().body.getReader();
  const chunks = []; let total = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > LIMIT) { reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes); }
  catch { return null; }
}

function presentationHeaders(response, changed) {
  const headers = new Headers(response.headers);
  headers.set(NAMEPLATE_HEADER, NAMEPLATE);
  if (changed) for (const name of [
    'content-length', 'etag', 'last-modified', 'content-md5', 'digest',
    'content-digest', 'repr-digest', 'accept-ranges', 'x-markdown-tokens',
  ]) headers.delete(name);
  return headers;
}

/** Apply once at the public Worker boundary after the existing handler returns.
 * HEAD receives equivalent nameplate/validator metadata and never a body.
 * JSON, signed protocol responses and catalogs are returned without reading,
 * parsing, reserializing, or changing their body streams. SVG is a full bypass.
 */
export async function decorateNameplate(request, response) {
  if (!(response instanceof Response) || response.status !== 200 && response.status !== 201) return response;
  let url; try { url = new URL(request.url); } catch { return response; }
  if (url.origin !== ORIGIN || url.pathname.startsWith('/__')) return response;
  const mode = transformation(url.pathname, response, request.method);
  if (mode === 'untouched') return response;
  const head = request.method === 'HEAD';
  if (head || mode === 'header') return new Response(head ? null : response.body, {
    status:response.status, statusText:response.statusText,
    headers:presentationHeaders(response, mode !== 'header'),
  });
  const original = await utf8Body(response);
  if (original === null) return new Response(response.body, {status:response.status, statusText:response.statusText, headers:presentationHeaders(response, false)});
  const body = mode === 'html' ? insertHtml(original) : insertMarkdown(original);
  return new Response(body, {
    status:response.status, statusText:response.statusText,
    headers:presentationHeaders(response, body !== original),
  });
}

export const applyNameplate = decorateNameplate;
