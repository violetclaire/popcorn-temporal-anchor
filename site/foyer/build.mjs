import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const skin = await read('skin.css');
const limits = 'a receipt is evidence of digest-and-timing only — not the underlying event, not agreement, identity, authorship, competence, completion, authorization, or permission. A receipt is evidence, never permission.';
const routes = [
  ['/mirror', 'CDI mirror'],
  ['/with-and-without-popcorn', 'With and Without POPCORN'],
  ['/#rooms', 'Rooms'],
];
const nav = current => `<header class="foyer-mast" data-foyer-navigation>
  <div class="foyer-brand"><a href="/">POPCORN / 767-2676.COM</a><span>FOYER</span></div>
  <nav class="foyer-nav" aria-label="Foyer">${routes.map(([href, label], i) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}><span aria-hidden="true">0${i + 1}</span>${label}</a>`).join('')}</nav>
</header>`;
const footer = next => `<footer class="foyer-foot" data-foyer-navigation>
  <a class="foyer-next" href="${next[0]}">${next[1]} →</a>
  <p>All interactivity runs on-device in the visitor's browser. No inputs leave the page.</p>
</footer>`;

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Source changed: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}

function securityPolicy(html) {
  const hashes = tag => [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g'))]
    .map(([, contents]) => `'sha256-${createHash('sha256').update(contents).digest('base64')}'`).join(' ');
  return `default-src 'none'; script-src ${hashes('script')}; style-src ${hashes('style')}; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
}

function finish(html, current, next) {
  // Remove remote fonts, including the network request, and use the site's fonts.
  html = html.replace(/^\s*@import url\([^\n]+\);\s*$/gm, '')
    .replaceAll('Archivo, Helvetica, sans-serif', 'Arial, Helvetica, sans-serif')
    .replaceAll('"IBM Plex Sans", sans-serif', 'Arial, Helvetica, sans-serif')
    .replaceAll('"IBM Plex Mono", monospace', 'Consolas, "Courier New", monospace')
    .replaceAll('"DM Mono", monospace', 'Consolas, "Courier New", monospace')
    .replace('name="color-scheme" content="light dark"', 'name="color-scheme" content="light"');
  html = replaceOnce(html, '</style>', `</style>\n  <style>\n${skin}</style>`);
  html = replaceOnce(html, '<body>', `<body>\n${nav(current)}`);
  html = replaceOnce(html, '</main>', `</main>\n${footer(next)}`);
  html = replaceOnce(html, '  <title>', `  <meta name="referrer" content="no-referrer" />\n  <meta http-equiv="Content-Security-Policy" content="${securityPolicy(html)}" />\n  <link rel="canonical" href="https://767-2676.com${current}" />\n  <title>`);
  assert.ok(!/@import|https:\/\/fonts\.|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b/.test(html));
  return html;
}

let mirror = await read('sources/cdi-slider.html');
// The supplied brief explicitly supersedes the older live page's axis labels.
// Preserve the original consequence tables and map Open → original state 2.
mirror = replaceOnce(mirror, '<span>Not open</span><span class="active">Licensed</span><span>Open source</span>', '<span>Open</span><span class="active">License what you built</span><span>Closed</span>');
mirror = replaceOnce(mirror, '<span>Separate</span><span class="active">Narrow trial</span><span>Build together</span>', '<span>Alone</span><span class="active">With us</span><span>Merged</span>');
mirror = replaceOnce(mirror, 'const li = Number(licenseSlider.value);', 'const position = Number(licenseSlider.value);\n      const li = 2 - position;');
mirror = replaceOnce(mirror, 'setText("license-number", `0${li + 1}`);', 'setText("license-number", `0${position + 1}`);');
mirror = replaceOnce(mirror, 'licenseSlider.setAttribute("aria-valuetext", license.title);', 'licenseSlider.setAttribute("aria-valuetext", ["Open", "License what you built", "Closed"][position]);');
mirror = replaceOnce(mirror, 'activateLabels("license-labels", li);', 'activateLabels("license-labels", position);');
mirror = replaceOnce(mirror, 'collabSlider.setAttribute("aria-valuetext", collab.title);', 'collabSlider.setAttribute("aria-valuetext", ["Alone", "With us", "Merged"][ci]);');
mirror = finish(mirror, routes[0][0], routes[1]);

let clock = await read('sources/with-and-without-popcorn.html');
clock = replaceOnce(clock, '    </section>\n  </main>', `    </section>\n    <p class="receipt-scope" data-brief-limits>${limits}</p>\n  </main>`);
// Prevent a slower earlier hash from overwriting the most recent selection.
clock = replaceOnce(clock, '      async function digest(value) {', '      let versionRequest = 0;\n\n      async function digest(value) {');
clock = replaceOnce(clock, "          hash.textContent = 'SHA-256 unavailable in this browser';\n          return;", "          return 'SHA-256 unavailable in this browser';");
clock = replaceOnce(clock, '        hash.textContent = [...new Uint8Array(result)]', '        return [...new Uint8Array(result)]');
clock = replaceOnce(clock, '        digest(isOriginal ? original : changed);', `        const request = ++versionRequest;
        hash.textContent = 'Calculating…';
        digest(isOriginal ? original : changed).then(value => {
          if (request === versionRequest) hash.textContent = value;
        }).catch(() => {
          if (request === versionRequest) hash.textContent = 'SHA-256 unavailable in this browser';
        });`);
clock = finish(clock, routes[1][0], routes[2]);

await writeFile(new URL('mirror.html', root), mirror);
await writeFile(new URL('with-and-without-popcorn.html', root), clock);
console.log('Built two self-contained foyer pages.');
