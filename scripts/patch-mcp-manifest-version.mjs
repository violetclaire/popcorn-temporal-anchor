import assert from 'node:assert/strict';

// Update only the exact discovery pathname. The shared asset and its aliases
// remain byte-identical. This patch is deliberately specific to 0.1.3 -> 0.1.4.
export const manifestPath = '/.well-known/mcp.json';
const oldField = '"version": "0.1.3"';
const newField = '"version": "0.1.4"';
export function manifestBody(source) {
  const matches = [...source.matchAll(/^var TASK_SCHEDULE_PUBLIC_ASSETS = (.+);\r?$/gm)];
  assert.equal(matches.length, 1, 'Exactly one embedded asset table required');
  return JSON.parse(matches[0][1])['/mcp/server.json'].body;
}
export function updatedManifest(body) {
  assert.equal(body.split(oldField).length - 1, 2, 'Exactly two old version fields required');
  const before = JSON.parse(body);
  assert.equal(before.version, '0.1.3');
  assert.equal(before.packages.length, 1);
  assert.equal(before.packages[0].version, '0.1.3');
  const result = body.replaceAll(oldField, newField);
  const expected = structuredClone(before);
  expected.version = '0.1.4';
  expected.packages[0].version = '0.1.4';
  assert.deepEqual(JSON.parse(result), expected, 'Only the two version fields may change');
  return result;
}
export function exactManifestInsertion(source) {
  const nl = source.includes('\r\n') ? '\r\n' : '\n';
  return [
    '  if (url.pathname === "/.well-known/mcp.json") {',
    '    const body = TASK_SCHEDULE_PUBLIC_ASSETS["/mcp/server.json"].body.replaceAll(\'"version": "0.1.3"\', \'"version": "0.1.4"\');',
    '    return discoveryDocumentResponse(request, body, "application/json; charset=utf-8");',
    '  }',
    ''
  ].join(nl);
}
export function patchExactManifest(source) {
  updatedManifest(manifestBody(source));
  const anchor = '  if (url.pathname === "/.well-known/mcp/server-card.json" || url.pathname === "/.well-known/mcp.json") {';
  const insertion = exactManifestInsertion(source);
  assert.equal(source.split(anchor).length - 1, 1, 'Exactly one original shared route required');
  assert(!source.includes(insertion), 'Already patched');
  const candidate = source.replace(anchor, insertion + anchor);
  assert.equal(candidate.replace(insertion, ''), source, 'Removing insertion must restore original bytes');
  assert.equal(manifestBody(candidate), manifestBody(source), 'Shared descriptor asset must remain identical');
  return candidate;
}
