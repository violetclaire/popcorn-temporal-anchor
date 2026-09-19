import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Apply only to a fresh download of the deployed Worker. Never overwrite it.
export function patchPrivacy(before, html) {
  const anchor = '    if (url.pathname === "/") {';
  assert.equal(before.split(anchor).length, 2, 'Expected one homepage route anchor; inspect the current Worker');
  assert.ok(!/url\.pathname\s*===?\s*["']\/privacy\/?["']/.test(before), 'Privacy route already exists; inspect before replacing');
  assert.ok(html.includes('https://767-2676.com/privacy'), 'Expected the privacy document');
  const addition = `    if (url.pathname === "/privacy" || url.pathname === "/privacy/") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response(null, { status: 405, headers: { "Allow": "GET, HEAD" } });
      }
      return new Response(request.method === "HEAD" ? null : ${JSON.stringify(html)}, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        }
      });
    }
`;
  const after = before.replace(anchor, addition + anchor);
  assert.equal(after.replace(addition, ''), before, 'Existing Worker must remain byte-for-byte unchanged');
  return after;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  assert.ok(input && output, 'Usage: node patch-privacy.mjs downloaded-worker.js patched-worker.js');
  assert.notEqual(resolve(input), resolve(output), 'Keep the original Worker backup');
  const before = await readFile(input, 'utf8');
  const html = await readFile(new URL('./privacy.html', import.meta.url), 'utf8');
  await writeFile(output, patchPrivacy(before, html), { flag: 'wx' });
  console.log('Prepared privacy routes. No deployment performed.');
}
