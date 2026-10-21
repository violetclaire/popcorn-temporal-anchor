import assert from 'node:assert/strict';

export const ROOT_CACHE_CONTROL = 'public, max-age=0, must-revalidate, no-transform';
export const PLAIN_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

// Prevent proxy-injected JavaScript without changing the owner's document.
// The existing status-200 branch is reached only for GET and HEAD.
export function patchRootNoTransform(before) {
  const start = before.indexOf('// operations-homepage:2026-10-20; homepage and plain-text companion.');
  assert(start >= 0, 'Expected the current combined presentation wrapper');
  const end = before.indexOf('\n  const demo = discoveryDemo(request);', start);
  assert(end > start);
  const segment = before.slice(start, end);
  const oldLine = '      page.headers.set("cache-control", "public, max-age=0, must-revalidate");';
  const newLine = '      page.headers.set("cache-control", asText ? "public, max-age=0, must-revalidate" : "public, max-age=0, must-revalidate, no-transform");';
  assert.equal(segment.split(oldLine).length, 2, 'Expected exactly one current cache header');
  assert(segment.includes('if (page.status === 200) {'));
  const replacement = segment.replace(oldLine, newLine);
  const after = before.slice(0, start) + replacement + before.slice(end);
  assert.equal(after.slice(0, start) + segment + after.slice(start + replacement.length), before);
  assert.equal(after.replace(newLine, oldLine), before, 'Only one cache-control assignment may change');
  return after;
}
