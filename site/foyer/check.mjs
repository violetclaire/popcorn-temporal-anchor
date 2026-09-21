import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { patchFoyer } from './patch-worker.mjs';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [mirror, clock, sourceMirror, sourceClock, home] = await Promise.all([
  read('mirror.html'), read('with-and-without-popcorn.html'),
  read('sources/cdi-slider.html'), read('sources/with-and-without-popcorn.html'),
  read('../front-page/index.html'),
]);
const scripts = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const main = html => html.match(/<main(?: class="page")?>([\s\S]*?)<\/main>/)[1];
const digest = value => createHash('sha256').update(value).digest('hex');

// Prove that source prose is retained, with only the brief's explicit additions.
assert.equal(main(mirror), main(sourceMirror)
  .replace('<span>Not open</span><span class="active">Licensed</span><span>Open source</span>', '<span>Open</span><span class="active">License what you built</span><span>Closed</span>')
  .replace('<span>Separate</span><span class="active">Narrow trial</span><span>Build together</span>', '<span>Alone</span><span class="active">With us</span><span>Merged</span>'));
assert.equal(main(clock).replace(/    <p class="receipt-scope" data-brief-limits>[^<]+<\/p>\n/, ''), main(sourceClock));
assert.ok(clock.includes('not the underlying event, not agreement, identity, authorship, competence, completion, authorization, or permission. A receipt is evidence, never permission.'));

for (const html of [mirror, clock]) {
  assert.doesNotMatch(html, /@import|<script[^>]+src=|<link[^>]+rel="(?:stylesheet|preconnect|prefetch)"|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b|document\.cookie|postMessage|<form\b/);
  assert.doesNotMatch(main(html), /Violet|Versailles|Herod/);
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const rule of ["default-src 'none'", "connect-src 'none'", "font-src 'none'", "frame-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'"]) assert.ok(policy.includes(rule));
  for (const tag of ['script', 'style']) {
    for (const [, body] of html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g'))) {
      const hash = createHash('sha256').update(body).digest('base64');
      assert.ok(policy.includes(`'sha256-${hash}'`), `${tag} must match its CSP hash`);
    }
  }
}

// Minimal DOM harness executes the unmodified source and adapted browser logic.
function domHarness(html, crypto = webcrypto) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '1', textContent: '', innerHTML: '', attrs: {}, events: {}, classes: new Set(),
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(type, listener) { this.events[type] = listener; },
      classList: { toggle(name, on) { if (on) element(id).classes.add(name); else element(id).classes.delete(name); } },
    });
    return elements.get(id);
  }
  const document = {
    getElementById: element,
    querySelectorAll(selector) { return [0, 1, 2].map(i => element(`${selector}:${i}`)); },
  };
  vm.runInNewContext(scripts(html).join('\n'), {document, window: {crypto}, crypto, TextEncoder});
  return {element, elements, input(id, value) { const el = element(id); el.value = String(value); el.events.input(); }, click(id) { element(id).events.click(); }};
}
const baseline = domHarness(sourceMirror);
const adapted = domHarness(mirror);
for (let position = 0; position < 3; position++) {
  for (let collaboration = 0; collaboration < 3; collaboration++) {
    baseline.input('license-slider', 2 - position);
    baseline.input('collab-slider', collaboration);
    adapted.input('license-slider', position);
    adapted.input('collab-slider', collaboration);
    for (const [id, el] of baseline.elements) {
      if (id !== 'license-number') assert.equal(adapted.element(id).textContent, el.textContent, `Original consequence copy: ${id}, ${position}/${collaboration}`);
    }
    assert.equal(adapted.element('license-number').textContent, `0${position + 1}`);
    assert.equal(adapted.element('license-slider').attrs['aria-valuetext'], ['Open', 'License what you built', 'Closed'][position]);
    assert.equal(adapted.element('collab-slider').attrs['aria-valuetext'], ['Alone', 'With us', 'Merged'][collaboration]);
    for (let i = 0; i < 3; i++) assert.equal(adapted.element(`#license-labels span:${i}`).classes.has('active'), i === position);
  }
}

const pending = [];
const trackedCrypto = {subtle: {digest(...args) { const result = webcrypto.subtle.digest(...args); pending.push(result); return result; }}};
const flush = async () => { await Promise.all(pending); await new Promise(resolve => setImmediate(resolve)); };
const demo = domHarness(clock, trackedCrypto);
await flush();
const friday = digest('Hold the date until Friday at 5:00 PM.');
const saturday = digest('Hold the date until Saturday at 5:00 PM.');
assert.equal(demo.element('hash-value').textContent, friday);
demo.click('changed-btn');
assert.equal(demo.element('hash-value').textContent, 'Calculating…');
await flush();
assert.equal(demo.element('hash-value').textContent, saturday);
assert.notEqual(friday, saturday);
assert.ok(demo.element('demo-text').innerHTML.includes('<mark>Saturday</mark>'));
assert.equal(demo.element('changed-btn').attrs['aria-pressed'], 'true');
demo.click('original-btn');
await flush();
assert.equal(demo.element('hash-value').textContent, friday);

const delayed = [];
const race = domHarness(clock, {subtle: {digest(algorithm, bytes) {
  return new Promise((resolve, reject) => delayed.push(() => webcrypto.subtle.digest(algorithm, bytes).then(resolve, reject)));
}}});
race.click('changed-btn');
await delayed[1]();
await new Promise(resolve => setImmediate(resolve));
assert.equal(race.element('hash-value').textContent, saturday);
await delayed[0]();
await new Promise(resolve => setImmediate(resolve));
assert.equal(race.element('hash-value').textContent, saturday, 'Late original digest cannot replace changed version');
const unsupported = domHarness(clock, null);
await new Promise(resolve => setImmediate(resolve));
assert.equal(unsupported.element('hash-value').textContent, 'SHA-256 unavailable in this browser');
const rejected = domHarness(clock, {subtle: {digest() { return Promise.reject(new Error('unavailable')); }}});
await new Promise(resolve => setImmediate(resolve));
assert.equal(rejected.element('hash-value').textContent, 'SHA-256 unavailable in this browser');

assert.ok(home.indexOf('href="/mirror"') < home.indexOf('href="/with-and-without-popcorn"'));
assert.ok(home.indexOf('href="/with-and-without-popcorn"') < home.indexOf('id="rooms"'));
// Exercise route preservation with an isolated Worker fixture, never production.
const before = `async function route(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") { return new Response("old home"); }
    return new Response("original service route: " + url.pathname);
}`;
const patched = patchFoyer(before, {home, mirror, clock});
assert.throws(() => patchFoyer(patched, {home, mirror, clock}), /already installed/);
assert.throws(() => patchFoyer('changed Worker', {home, mirror, clock}), /root-route anchor/);
const route = vm.runInNewContext(`${patched}\nroute`, {URL, Response});
for (const [path, expected] of [['/', home], ['/mirror', mirror], ['/mirror/', mirror], ['/with-and-without-popcorn', clock], ['/with-and-without-popcorn/', clock]]) {
  const response = await route(new Request(`https://example.test${path}`));
  assert.equal(await response.text(), expected);
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
}
assert.equal(await (await route(new Request('https://example.test/mirror', {method: 'HEAD'}))).text(), '');
assert.equal((await route(new Request('https://example.test/mirror', {method: 'POST'}))).status, 405);
for (const path of ['/v1/time', '/v1/receipt', '/.well-known/popcorn-keys.json', '/schedule', '/agents']) {
  assert.equal(await (await route(new Request(`https://example.test${path}`))).text(), `original service route: ${path}`);
}
console.log('PASS: source copy, all 9 slider combinations, brief labels, SHA-256 values, out-of-order results, unavailable crypto, CSP hashes, no network/storage APIs, foyer order, static routes, and service-route preservation.');
console.log(JSON.stringify({friday, saturday}, null, 2));
