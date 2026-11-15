import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertPublicUrl, fetchCard, HttpError, sha256, validateCard } from './card.mjs';

const URL = 'https://member.briarwood.ai/card.json';
const fixedNow = () => new Date('2026-10-21T20:00:00.000Z');
const encoder = new TextEncoder();
function card() {
  return {
    schema: 'briarwood-card/1', catalog: 'https://briarwood.ai/catalog', listed: true,
    name: 'A human artist', offer: 'Wedding hair and makeup for small parties', card_url: URL,
    terms: { scope: 'Hair and makeup', time: 'Ask about your date; availability is not confirmed.', cost: 'Quote before agreement', consequences: 'Cancellation terms agreed before deposit', decision: 'Explicit agreement by both parties' },
    witness: { verification_url: 'https://767-2676.com/mcp', trusted_keys: [], limitations: 'No member-bound signing key is published.' },
    contact: { url: 'https://member.briarwood.ai/contact?service=bridal', instructions: 'Send your requested date and party size for a quote.' },
  };
}
const response = (text, headers = {}) => new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const code = expected => error => error instanceof HttpError && error.code === expected && typeof error.status === 'number';

test('a human card with no member key or service is valid, cloned, and preserves declared availability', () => {
  const input = card();
  const result = validateCard(input, URL);
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.notEqual(result.terms, input.terms);
  assert.equal(result.member_key, undefined);
  assert.equal(result.terms.time, input.terms.time);
});

test('service-only and combined cards are valid declarations; stdio needs a package', () => {
  const input = card();
  delete input.contact;
  input.service = { transport: 'streamable-http', endpoint: 'https://767-2676.com/mcp', instructions: 'Discover tools first.', authentication: 'None for free tools' };
  assert.deepEqual(validateCard(input, URL).service, input.service);
  input.service = { transport: 'stdio', package: '@violetclaire/popcorn-mcp', instructions: 'Installation is the reader’s decision.', authentication: 'None for free tools' };
  assert.equal(validateCard(input, URL).service.transport, 'stdio');
  delete input.service.package;
  assert.throws(() => validateCard(input, URL), /service.package/);
});

test('publisher opt-in and an actionable next step are mandatory; explicit withdrawal remains valid', () => {
  for (const mutate of [x => delete x.catalog, x => { x.catalog = 'https://other.briarwood.ai/catalog'; }, x => delete x.listed, x => { x.listed = 'true'; }, x => delete x.contact]) {
    const input = card(); mutate(input);
    assert.throws(() => validateCard(input, URL), code('CARD_FIELD_INVALID'));
  }
  const input = card(); input.listed = false;
  assert.equal(validateCard(input, URL).listed, false);
});

test('named required fields, declared limits, and offer line boundaries are checked', () => {
  for (const field of ['scope', 'time', 'cost', 'consequences', 'decision']) {
    const input = card(); delete input.terms[field];
    assert.throws(() => validateCard(input, URL), new RegExp(`terms.${field}`));
  }
  for (const [field, value] of [['name', 'x'.repeat(121)], ['name', 'Alice\nStudio'], ['name', 'Alice\rStudio'], ['name', 'Alice\tStudio'], ['offer', 'x'.repeat(601)], ['offer', 'first\nsecond'], ['offer', 'first\u2028second']]) {
    const input = card(); input[field] = value;
    assert.throws(() => validateCard(input, URL), new RegExp(field));
  }
  const input = card(); input.terms.scope = 'x'.repeat(2001);
  assert.throws(() => validateCard(input, URL), /terms.scope/);
});

test('empty trusted keys require limitations, while a valid Ed25519 public key is optional', () => {
  const input = card(); delete input.witness.limitations;
  assert.throws(() => validateCard(input, URL), /witness.limitations/);
  input.witness.trusted_keys = ['issuer-key-1', 'https://767-2676.com/.well-known/jwks.json'];
  input.member_key = { algorithm: 'Ed25519', public_key: Buffer.alloc(32, 7).toString('base64url') };
  assert.deepEqual(validateCard(input, URL).member_key, input.member_key);
  for (const invalid of ['A'.repeat(42), 'A'.repeat(42) + 'B', Buffer.alloc(32).toString('base64')]) {
    input.member_key.public_key = invalid;
    assert.throws(() => validateCard(input, URL), /member_key.public_key/);
  }
});

test('card identity must match the submitted canonical address', () => {
  const input = card(); input.card_url = 'https://another.briarwood.ai/card.json';
  assert.throws(() => validateCard(input, URL), /match the submitted address/);
  input.card_url = 'https://MEMBER.briarwood.ai/card.json';
  assert.throws(() => validateCard(input, URL), /canonical/);
});

test('public URL guard blocks private, numeric, reserved, ambiguous, credentialed and decorated card URLs', () => {
  const invalid = [
    'http://member.briarwood.ai/card.json', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://0x7f000001/a',
    'https://0177.0.0.1/a', 'https://8.8.8.8/a', 'https://[::1]/a', 'https://[2606:4700:4700::1111]/a',
    'https://localhost/a', 'https://metadata/a', 'https://x.local/a', 'https://x.internal/a', 'https://x.test/a',
    'https://x.example/a', 'https://example.com/a', 'https://x.example.org/a', 'https://member.briarwood.ai./a',
    'https://user:pass@member.briarwood.ai/a', 'https://member.briarwood.ai:444/a', `${URL}?a=1`, `${URL}#x`,
    `${URL}?`, `${URL}#`, ` ${URL}`, 'https://member.briarwood.ai\\evil',
  ];
  for (const url of invalid) assert.throws(() => assertPublicUrl(url), code('CARD_URL_INVALID'), url);
  assert.equal(assertPublicUrl('https://member.briarwood.ai:443/card.json'), URL);
});

test('exact UTF-8 response bytes, including whitespace and non-ASCII text, determine hash and byte count', async () => {
  const input = card(); input.name = 'Zoë — 花';
  const text = '\n' + JSON.stringify(input, null, 2) + '\n';
  const raw = encoder.encode(text);
  const result = await fetchCard(URL, { fetchImpl: async () => response(raw), now: fixedNow });
  assert.equal(result.sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(result.bytes, raw.byteLength);
  assert.notEqual(result.bytes, text.length);
  assert.notEqual(result.sha256, await sha256(encoder.encode(JSON.stringify(input))));
  assert.equal(result.fetched_at, '2026-10-21T20:00:00.000Z');
  assert.deepEqual(result.card, input);
});

test('fetch uses no credentials/redirects and never fetches contact, keys, or service endpoints', async () => {
  const input = card(); input.service = { transport: 'https', endpoint: 'https://service.briarwood.ai/run', instructions: 'Ask first.', authentication: 'Provider-owned' };
  input.witness.trusted_keys = ['https://keys.briarwood.ai/jwks.json'];
  const calls = [];
  await fetchCard(URL, { fetchImpl: async (...args) => { calls.push(args); return response(JSON.stringify(input)); } });
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, URL);
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(options.headers), ['Accept']);
});

test('redirect responses and already-followed redirects are rejected without a second fetch', async () => {
  for (const result of [new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    { status: 200, headers: new Headers(), redirected: true },
    { status: 200, headers: new Headers(), url: 'https://other.briarwood.ai/card.json' }]) {
    let calls = 0;
    await assert.rejects(fetchCard(URL, { fetchImpl: async () => { calls++; return result; } }), code('CARD_REDIRECT'));
    assert.equal(calls, 1);
  }
});

test('non-JSON, invalid UTF-8, malformed JSON, and non-success statuses yield distinct safe errors', async () => {
  const cases = [
    [response('{}', { 'content-type': 'text/html' }), 'CARD_CONTENT_TYPE'],
    [response('{}', { 'content-type': 'application/json; charset=iso-8859-1' }), 'CARD_CONTENT_TYPE'],
    [response(new Uint8Array([0xc3, 0x28])), 'CARD_UTF8_INVALID'],
    [response('{broken'), 'CARD_JSON_INVALID'],
    [new Response('upstream secret not exposed', { status: 403 }), 'CARD_HTTP_ERROR'],
  ];
  for (const [result, expected] of cases) await assert.rejects(fetchCard(URL, { fetchImpl: async () => result }), code(expected));
  await assert.rejects(fetchCard(URL, { fetchImpl: async () => { throw new Error('private credential'); } }), error => error.code === 'CARD_FETCH_FAILED' && !error.message.includes('credential'));
  const result = await fetchCard(URL, { fetchImpl: async () => response(JSON.stringify(card()), { 'content-type': 'application/vnd.briarwood+json' }) });
  assert.equal(result.card.name, card().name);
});

test('declared and streamed byte limits reject oversized content; the exact 64KiB boundary is accepted', async () => {
  await assert.rejects(fetchCard(URL, { fetchImpl: async () => response('{}', { 'content-length': '65537' }) }), code('CARD_TOO_LARGE'));
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(40000)); controller.enqueue(new Uint8Array(30000)); }, cancel() { cancelled = true; } });
  await assert.rejects(fetchCard(URL, { fetchImpl: async () => response(stream) }), code('CARD_TOO_LARGE'));
  assert.equal(cancelled, true);
  const base = JSON.stringify(card());
  const atLimit = base + ' '.repeat(65536 - encoder.encode(base).byteLength);
  assert.equal((await fetchCard(URL, { fetchImpl: async () => response(atLimit) })).bytes, 65536);
});

test('DNS preflight rejects any nonpublic answer before fetch; it does not claim DNS pinning', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(JSON.stringify(card())); };
  for (const address of ['127.0.0.1', '10.0.0.1', '100.64.1.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::1', '3fff::1']) {
    await assert.rejects(fetchCard(URL, { fetchImpl, resolvePublic: async () => ['8.8.8.8', address] }), code('CARD_URL_NOT_PUBLIC'), address);
  }
  await assert.rejects(fetchCard(URL, { fetchImpl, resolvePublic: async () => [] }), code('CARD_URL_NOT_PUBLIC'));
  await assert.rejects(fetchCard(URL, { fetchImpl, resolvePublic: async () => { throw new Error('resolver secret'); } }), code('CARD_DNS_FAILED'));
  assert.equal(calls, 0);
  const result = await fetchCard(URL, { fetchImpl, resolvePublic: async hostname => { assert.equal(hostname, 'member.briarwood.ai'); return [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }]; } });
  assert.equal(result.card.card_url, URL);
  assert.equal(calls, 1);
});

test('timeout covers a stalled response body, aborts fetch, and cancels its reader', { timeout: 11000 }, async () => {
  let signal;
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('{')); }, cancel() { cancelled = true; } });
  await assert.rejects(fetchCard(URL, { fetchImpl: async (_, options) => { signal = options.signal; return response(stream); } }), code('CARD_TIMEOUT'));
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
});
