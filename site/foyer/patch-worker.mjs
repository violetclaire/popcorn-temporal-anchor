import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Insert static routes into a freshly downloaded Worker without touching service
// functions, bindings, signing configuration, or existing route implementations.
export function patchFoyer(before, files) {
  const marker = '/* POPCORN_STATIC_FOYER_V1 */';
  assert.ok(!before.includes(marker), 'Foyer already installed; inspect the current Worker before updating.');
  const anchor = '    if (url.pathname === "/") {';
  assert.equal(before.split(anchor).length, 2, 'Expected exactly one current root-route anchor; inspect changed source.');
  const pages = {
    '/': files.home,
    '/mirror': files.mirror,
    '/mirror/': files.mirror,
    '/with-and-without-popcorn': files.clock,
    '/with-and-without-popcorn/': files.clock,
  };
  for (const value of Object.values(pages)) assert.ok(value?.startsWith('<!doctype html>'), 'Missing page HTML');
  const addition = `    ${marker}
    if (["/", "/mirror", "/mirror/", "/with-and-without-popcorn", "/with-and-without-popcorn/"].includes(url.pathname)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response(null, {status: 405, headers: {Allow: "GET, HEAD"}});
      }
      const foyerPages = ${JSON.stringify(pages)};
      return new Response(request.method === "HEAD" ? null : foyerPages[url.pathname], {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=0, must-revalidate",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "frame-ancestors 'none'"
        }
      });
    }
`;
  const after = before.replace(anchor, addition + anchor);
  assert.equal(after.replace(addition, ''), before, 'Only the static foyer insertion may change the Worker');
  return after;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  assert.ok(input && output && input !== output, 'Usage: node site/foyer/patch-worker.mjs current-worker.mjs patched-worker.mjs');
  const base = new URL('./', import.meta.url);
  const before = await readFile(input, 'utf8');
  const files = {
    home: await readFile(new URL('../front-page/index.html', base), 'utf8'),
    mirror: await readFile(new URL('mirror.html', base), 'utf8'),
    clock: await readFile(new URL('with-and-without-popcorn.html', base), 'utf8'),
  };
  await writeFile(output, patchFoyer(before, files), {flag: 'wx'});
  console.log('Prepared static foyer routes; all original Worker source is retained.');
}
