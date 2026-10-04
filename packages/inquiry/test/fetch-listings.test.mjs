import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { ProtocolError, signEnvelope } from '../src/crypto.mjs';
import { discoverProviders } from '../src/fetch-listings.mjs';

const asOf = '2026-10-03T12:00:00Z';
const query = { capabilities: ['analysis'] };

function fixture(id = 'provider-a') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const sourceUrl = `https://${id}.example/listing.json`;
  const inquiryUrl = `https://${id}.example/inquiries`;
  const identity = { id, kid: 'key-1', privateKey };
  const trust = { [id]: { keys: { 'key-1': publicKey.export({ format: 'jwk' }) }, endpoints: [sourceUrl, inquiryUrl] } };
  const envelope = signEnvelope({
    protocol: 'BRIARWOOD-LISTING/1', type: 'listing', issuer: id, listing_id: 'listing-1',
    issued_at: '2026-10-03T00:00:00Z', expires_at: '2026-10-04T00:00:00Z',
    subject: 'CSV analysis', capabilities: ['analysis', 'csv'], conditions: [], inquiry_endpoint: inquiryUrl,
    terms: { version: 'v1', summary: 'Analyze one CSV', price: { amount_atomic: '1000', currency: 'USDC', network: 'eip155:8453', payee: 'wallet' }, constraints: [] },
    response_within_ms: 60_000,
  }, identity);
  return { identity, trust, envelope, sourceUrl, source: { issuer: id, url: sourceUrl } };
}

test('explicit discovery fetches pinned listing URL using bounded GET without payment or inquiry', async () => {
  const f = fixture(); let calls = 0;
  const result = await discoverProviders([f.source], query, { trust: f.trust, asOf, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, f.sourceUrl);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(options.headers, { accept: 'application/json' });
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body, undefined);
    return Response.json(f.envelope);
  } });
  assert.equal(calls, 1);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.retrievals, [{ index: 0, state: 'retrieved', http_status: 200 }]);
});

test('all source pins and query are validated before network access', async () => {
  const f = fixture(); let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json(f.envelope); };
  await assert.rejects(discoverProviders([f.source], { capabilities: 'analysis' }, { trust: f.trust, asOf, fetchImpl }), { code: 'invalid_search_query' });
  assert.equal(calls, 0);
  const result = await discoverProviders([
    { ...f.source, url: 'https://provider-a.example/not-pinned' },
    { ...f.source, issuer: 'untrusted' },
    { ...f.source, url: 'https://127.0.0.1/listing' },
    { ...f.source, credentials: 'secret' },
  ], query, { trust: f.trust, asOf, fetchImpl });
  assert.equal(calls, 0);
  assert.deepEqual(result.rejected.map(item => item.reason), ['untrusted_source_endpoint', 'untrusted_source_issuer', 'private_endpoint', 'invalid_source']);
  await assert.rejects(discoverProviders(Array(21).fill(f.source), query, { trust: f.trust, asOf, fetchImpl }), { code: 'invalid_source_list' });
  await assert.rejects(discoverProviders([f.source], query, { trust: f.trust, asOf, fetchImpl, timeoutMs: 10_001 }), { code: 'invalid_source_timeout' });
  assert.equal(calls, 0);
});

test('returned listing must belong to its source issuer even if the other issuer is independently trusted', async () => {
  const a = fixture('provider-a'), b = fixture('provider-b');
  const result = await discoverProviders([a.source], query, { trust: { ...a.trust, ...b.trust }, asOf, fetchImpl: async () => Response.json(b.envelope) });
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.rejected, [{ index: 0, reason: 'source_issuer_mismatch' }]);
});

test('redirects are rejected without follow-up requests, including a transport that reports a followed redirect', async () => {
  const f = fixture(); let calls = 0;
  const result = await discoverProviders([f.source], query, { trust: f.trust, asOf, fetchImpl: async (_url, options) => {
    calls++; assert.equal(options.redirect, 'error');
    return new Response('redirect', { status: 302, headers: { location: 'https://other.example/listing' } });
  } });
  assert.equal(calls, 1);
  assert.equal(result.rejected[0].reason, 'source_redirect');
  const redirected = Response.json(f.envelope);
  Object.defineProperty(redirected, 'redirected', { value: true });
  const followed = await discoverProviders([f.source], query, { trust: f.trust, asOf, fetchImpl: async () => redirected });
  assert.equal(followed.rejected[0].reason, 'source_redirect');
});

test('402 and 429 responses stay explicit failures without payments, retries, or response-body disclosure', async () => {
  const f = fixture(); let calls = 0;
  const result = await discoverProviders([f.source, f.source], query, { trust: f.trust, asOf, fetchImpl: async () => {
    const status = calls++ === 0 ? 402 : 429;
    return new Response('secret payment instructions', { status, headers: { 'payment-required': 'secret', 'retry-after': '1' } });
  } });
  assert.equal(calls, 2);
  assert.deepEqual(result.rejected, [{ index: 0, reason: 'source_http_402' }, { index: 1, reason: 'source_http_429' }]);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('deadline aborts hanging fetches even if an injected transport ignores the abort signal', async () => {
  const f = fixture(); let observedSignal;
  const result = await discoverProviders([f.source], query, { trust: f.trust, asOf, timeoutMs: 15, fetchImpl: async (_url, options) => {
    observedSignal = options.signal;
    return new Promise(() => {});
  } });
  assert.equal(observedSignal.aborted, true);
  assert.deepEqual(result.rejected, [{ index: 0, reason: 'source_timeout' }]);
});

test('deadline also bounds streaming bodies and cancels a stalled stream', async () => {
  const f = fixture(); let cancelled = false;
  const result = await discoverProviders([f.source], query, { trust: f.trust, asOf, timeoutMs: 15, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'application/json' } }) });
  assert.equal(result.rejected[0].reason, 'source_timeout');
  assert.equal(cancelled, true);
});

test('declared and streamed oversized bodies are cancelled at the 64 KiB boundary', async () => {
  const f = fixture();
  for (const declared of [false, true]) {
    let cancelled = false; let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(32_768)); },
      cancel() { cancelled = true; },
    });
    const result = await discoverProviders([f.source], query, { trust: f.trust, asOf, fetchImpl: async () => new Response(stream, {
      headers: { 'content-type': 'application/json', ...(declared ? { 'content-length': '65537' } : {}) },
    }) });
    assert.deepEqual(result.rejected, [{ index: 0, reason: 'source_body_limit' }]);
    assert.equal(cancelled, true);
    assert.ok(pulls <= 4, 'Reader must stop immediately after crossing the cap');
  }
});

test('malformed bodies, expired listings, and transport failures produce only bounded diagnostics', async () => {
  const f = fixture();
  const expired = signEnvelope({ ...f.envelope.payload, expires_at: asOf }, f.identity);
  const cases = [
    [() => new Response('private raw garbage', { headers: { 'content-type': 'application/json' } }), 'source_invalid_json'],
    [() => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }), 'source_invalid_json'],
    [() => new Response('private html', { headers: { 'content-type': 'text/html' } }), 'source_content_type'],
    [() => Response.json(expired), 'listing_expired'],
    [() => { throw new Error('private transport details'); }, 'source_fetch_failed'],
    [() => { throw new ProtocolError('private transport details'); }, 'source_fetch_failed'],
  ];
  for (const [fetchImpl, reason] of cases) {
    const result = await discoverProviders([f.source], query, { trust: f.trust, asOf, fetchImpl });
    assert.deepEqual(result.rejected, [{ index: 0, reason }]);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('exact duplicates are identified and valid candidates still obey the search query', async () => {
  const f = fixture(); let active = 0, peak = 0;
  const fetchImpl = async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return Response.json(f.envelope); };
  const result = await discoverProviders([f.source, f.source], query, { trust: f.trust, asOf, fetchImpl });
  assert.equal(peak, 1);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.retrievals.map(item => item.state), ['retrieved', 'duplicate']);
  const noMatch = await discoverProviders([f.source], { capabilities: ['unavailable'] }, { trust: f.trust, asOf, fetchImpl });
  assert.deepEqual(noMatch.matches, []);
  assert.deepEqual(noMatch.rejected, []);
  assert.equal(noMatch.retrievals[0].state, 'retrieved');
});
