import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { canonical, digest, ProtocolError, signEnvelope, verifyEnvelope } from '../src/crypto.mjs';
import { searchProviders, validateListing } from '../src/discovery.mjs';

const NOW = '2026-10-03T12:00:00.000Z';

function participant(id = 'provider-a') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const identity = { id, kid: 'key-1', privateKey };
  const endpoint = `https://${id}.example/inquiries`;
  const trust = { [id]: { keys: { 'key-1': publicKey.export({ format: 'jwk' }) }, endpoints: [endpoint] } };
  return { identity, trust, endpoint, publicKey };
}

function fixture(id = 'provider-a', change = {}) {
  const node = participant(id);
  const payload = {
    protocol: 'BRIARWOOD-LISTING/1', type: 'listing', issuer: id, listing_id: 'listing-1',
    issued_at: '2026-10-03T00:00:00Z', expires_at: '2026-10-04T00:00:00Z',
    subject: 'Structured data analysis', capabilities: ['analysis', 'csv'], conditions: ['English output'],
    inquiry_endpoint: node.endpoint,
    terms: { version: 'v1', summary: 'Analyze one CSV file', price: { amount_atomic: '1000', currency: 'USDC', network: 'eip155:8453', payee: 'provider-wallet' }, constraints: ['Maximum 10 MiB'] },
    response_within_ms: 60_000, ...change,
  };
  return { ...node, payload, envelope: signEnvelope(payload, node.identity) };
}

const rejects = (fn, code) => assert.throws(fn, error => error instanceof ProtocolError && error.code === code);

test('canonical JSON has stable object ordering, preserves array order, and rejects non-JSON input', () => {
  assert.equal(canonical({ z: [2, 1], a: { y: true, x: null } }), '{"a":{"x":null,"y":true},"z":[2,1]}');
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
  assert.equal(canonical(-0), '0');
  for (const value of [undefined, NaN, Infinity, 2 ** 53, 1n, new Date(), new Map(), () => {}]) assert.throws(() => canonical(value), ProtocolError);
  rejects(() => canonical('\ud800'), 'invalid_json_string');
  rejects(() => canonical({ '\ud800': 1 }), 'invalid_json_key');
  rejects(() => canonical([, 1]), 'invalid_json_array');
  let getterCalls = 0;
  rejects(() => canonical({ get value() { getterCalls++; return 1; } }), 'invalid_json_property');
  assert.equal(getterCalls, 0);
  const cycle = {}; cycle.self = cycle;
  rejects(() => canonical(cycle), 'invalid_json_cycle');
  let deep = null; for (let i = 0; i < 34; i++) deep = { value: deep };
  rejects(() => canonical(deep), 'json_limit');
  rejects(() => canonical('x'.repeat(1_048_577)), 'invalid_json_string');
});

test('signing and verification clone payloads and pin Ed25519 issuer keys', () => {
  const f = fixture();
  const verified = verifyEnvelope(f.envelope, f.trust);
  assert.deepEqual(verified, f.payload);
  verified.terms.summary = 'changed by verifier caller';
  f.payload.terms.summary = 'changed by signing caller';
  assert.equal(f.envelope.payload.terms.summary, 'Analyze one CSV file');
  assert.equal(verifyEnvelope(f.envelope, f.trust).terms.summary, 'Analyze one CSV file');
  rejects(() => signEnvelope({ issuer: 'someone-else' }, f.identity), 'issuer_identity_mismatch');
  const privateJwk = f.identity.privateKey.export({ format: 'jwk' });
  assert.equal(verifyEnvelope(signEnvelope({ issuer: f.identity.id, data: true }, { ...f.identity, privateKey: privateJwk }), f.trust).data, true);
  const wrongAlgorithm = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  rejects(() => signEnvelope({ issuer: f.identity.id }, { ...f.identity, privateKey: wrongAlgorithm.privateKey }), 'invalid_signing_key');
});

test('tampered payload and signatures fail; signing has a smaller limit than persisted canonical JSON', () => {
  const f = fixture();
  const changed = structuredClone(f.envelope); changed.payload.subject = 'Altered terms';
  rejects(() => verifyEnvelope(changed, f.trust), 'payload_mismatch');
  const parts = f.envelope.jws.split('.');
  const signature = Buffer.from(parts[2], 'base64url'); signature[0] ^= 1;
  rejects(() => verifyEnvelope({ ...f.envelope, jws: `${parts[0]}.${parts[1]}.${signature.toString('base64url')}` }, f.trust), 'invalid_signature');
  rejects(() => verifyEnvelope({ ...f.envelope, jws: f.envelope.jws + '=' }, f.trust), 'invalid_jws_signature');
  assert.ok(canonical({ data: 'x'.repeat(70_000) }).length > 65_536);
  rejects(() => signEnvelope({ issuer: f.identity.id, data: 'x'.repeat(70_000) }, f.identity), 'signed_payload_limit');
});

test('untrusted issuer, unknown key, inherited trust entries, and private trusted keys are rejected', () => {
  const f = fixture();
  rejects(() => verifyEnvelope(f.envelope, {}), 'untrusted_issuer');
  rejects(() => verifyEnvelope(f.envelope, { [f.identity.id]: { keys: {}, endpoints: [f.endpoint] } }), 'untrusted_key');
  rejects(() => verifyEnvelope(f.envelope, Object.create(f.trust)), 'untrusted_issuer');
  const inheritedKey = { [f.identity.id]: { keys: Object.create(f.trust[f.identity.id].keys) } };
  rejects(() => verifyEnvelope(f.envelope, inheritedKey), 'untrusted_key');
  const privateTrust = { [f.identity.id]: { keys: { 'key-1': f.identity.privateKey.export({ format: 'jwk' }) } } };
  rejects(() => verifyEnvelope(f.envelope, privateTrust), 'invalid_trusted_key');
  const other = participant();
  rejects(() => verifyEnvelope(f.envelope, other.trust), 'invalid_signature');
});

test('JWS headers have an exact canonical protected shape and cannot advertise their own keys', () => {
  const f = fixture();
  const body = f.envelope.jws.split('.')[1];
  function envelopeWith(headerText) {
    const header = Buffer.from(headerText).toString('base64url');
    const input = `${header}.${body}`;
    return { payload: f.envelope.payload, jws: `${input}.${sign(null, Buffer.from(input), f.identity.privateKey).toString('base64url')}` };
  }
  for (const header of [
    canonical({ alg: 'none', kid: 'key-1', typ: 'BRIARWOOD-JWS/1' }),
    canonical({ alg: 'EdDSA', kid: 'key-1', typ: 'BRIARWOOD-JWS/1', jwk: f.publicKey.export({ format: 'jwk' }) }),
    '{"kid":"key-1","alg":"EdDSA","typ":"BRIARWOOD-JWS/1"}',
    '{"alg":"EdDSA","alg":"EdDSA","kid":"key-1","typ":"BRIARWOOD-JWS/1"}',
  ]) rejects(() => verifyEnvelope(envelopeWith(header), f.trust), 'invalid_jws_header');
  rejects(() => verifyEnvelope({ ...f.envelope, jwk: f.publicKey.export({ format: 'jwk' }) }, f.trust), 'invalid_envelope');
});

test('valid listing exposes exact terms and supports an explicit time without reading the clock', () => {
  const f = fixture();
  const options = { trust: f.trust, asOf: NOW };
  assert.deepEqual(validateListing(f.envelope, options), f.payload);
  assert.deepEqual(validateListing(f.envelope, { ...options, asOf: Date.parse(NOW) }), f.payload);
  assert.deepEqual(validateListing(f.envelope, { ...options, asOf: new Date(NOW) }), f.payload);
  rejects(() => validateListing(f.envelope, { trust: f.trust }), 'invalid_as_of');
});

test('listing time validation rejects expiry, future publication, impossible calendar dates, and reversed intervals', () => {
  for (const [change, code] of [
    [{ expires_at: NOW }, 'listing_expired'],
    [{ issued_at: '2026-10-03T13:00:00Z' }, 'listing_not_yet_valid'],
    [{ issued_at: '2026-02-30T00:00:00Z' }, 'invalid_date'],
    [{ expires_at: '2026-10-02T00:00:00Z' }, 'invalid_listing_window'],
    [{ issued_at: '2026-10-03' }, 'invalid_date'],
  ]) {
    const f = fixture('provider-a', change);
    rejects(() => validateListing(f.envelope, { trust: f.trust, asOf: NOW }), code);
  }
});

test('listing rejects endpoint changes and unsafe URLs even when explicitly present in trust', () => {
  const base = fixture();
  const changed = signEnvelope({ ...base.payload, inquiry_endpoint: 'https://other.example/inquiries' }, base.identity);
  rejects(() => validateListing(changed, { trust: base.trust, asOf: NOW }), 'untrusted_endpoint');
  for (const endpoint of ['http://provider-a.example/inquiries', 'https://user:pass@provider-a.example/inquiries', 'https://provider-a.example/inquiries#fragment', 'https://localhost/inquiries', 'https://127.0.0.1/inquiries', 'https://10.0.0.1/inquiries', 'https://172.16.0.1/inquiries', 'https://192.168.1.1/inquiries', 'https://[::1]/inquiries', 'https://[::ffff:7f00:1]/inquiries', 'https://[fd00::1]/inquiries']) {
    const envelope = signEnvelope({ ...base.payload, inquiry_endpoint: endpoint }, base.identity);
    const trust = { [base.identity.id]: { ...base.trust[base.identity.id], endpoints: [endpoint] } };
    assert.throws(() => validateListing(envelope, { trust, asOf: NOW }), error => ['private_endpoint', 'invalid_endpoint'].includes(error.code), endpoint);
  }
});

test('boundary validation rejects malformed listing types, unknown fields, unsafe price and response windows', () => {
  const f = fixture();
  const changes = [
    { unexpected: true }, { subject: 123 }, { capabilities: ['analysis', 1] }, { conditions: {} },
    { capabilities: [] }, { capabilities: ['analysis', 'analysis'] }, { response_within_ms: 0 },
    { response_within_ms: 2_592_000_001 }, { response_within_ms: 1.5 },
    { terms: { ...f.payload.terms, extra: 'field' } },
    { terms: { ...f.payload.terms, price: { ...f.payload.terms.price, amount_atomic: 1000 } } },
    { terms: { ...f.payload.terms, price: { ...f.payload.terms.price, amount_atomic: '-1' } } },
    { terms: { ...f.payload.terms, price: { ...f.payload.terms.price, amount_atomic: '01' } } },
  ];
  for (const change of changes) assert.throws(() => validateListing(signEnvelope({ ...f.payload, ...change }, f.identity), { trust: f.trust, asOf: NOW }), ProtocolError);
});

test('search requires all requested capabilities and text words, sorts deterministically, and carries frozen terms digest', () => {
  const a = fixture('provider-a'); const b = fixture('provider-b');
  const c = fixture('provider-c', { capabilities: ['analysis'] });
  const trust = { ...a.trust, ...b.trust, ...c.trust };
  const result = searchProviders([b.envelope, c.envelope, a.envelope], { capabilities: ['analysis', 'csv'], text: 'data English' }, { trust, asOf: NOW });
  assert.deepEqual(result.matches.map(match => match.listing.payload.issuer), ['provider-a', 'provider-b']);
  assert.equal(result.matches[0].terms_digest, digest(a.payload.terms));
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(searchProviders([a.envelope], { capabilities: ['unknown'] }, { trust, asOf: NOW }).matches, []);
  assert.deepEqual(searchProviders([a.envelope], { capabilities: [], text: 'not-present' }, { trust, asOf: NOW }).matches, []);
});

test('search reports expired, malformed, tampered, and untrusted candidates without contacting them', () => {
  const good = fixture();
  const expired = fixture('expired-provider', { expires_at: NOW });
  const unknown = fixture('unknown-provider');
  const tampered = structuredClone(good.envelope); tampered.payload.subject = 'bad';
  const result = searchProviders([good.envelope, expired.envelope, null, unknown.envelope, tampered], { capabilities: [] }, { trust: { ...good.trust, ...expired.trust }, asOf: NOW });
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.rejected, [
    { index: 1, reason: 'listing_expired' }, { index: 2, reason: 'invalid_envelope' },
    { index: 3, reason: 'untrusted_issuer' }, { index: 4, reason: 'payload_mismatch' },
  ]);
});

test('search rejects malformed queries before processing candidates', () => {
  for (const query of [null, {}, { capabilities: 'analysis' }, { capabilities: [1] }, { capabilities: [], text: 1 }, { capabilities: [], text: '' }, { capabilities: [], unknown: true }]) {
    rejects(() => searchProviders([], query, { trust: {}, asOf: NOW }), 'invalid_search_query');
  }
  rejects(() => searchProviders({}, { capabilities: [] }, { trust: {}, asOf: NOW }), 'invalid_candidate_list');
});
