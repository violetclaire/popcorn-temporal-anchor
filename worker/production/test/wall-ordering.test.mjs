import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { BriarwoodAgentEngine } from '../index.js';

const origin = 'https://767-2676.com';
const payTo = '0x5f5a631e975183d084f60d7121e967b30ec83cb8';
const b64 = byte => Buffer.alloc(32, byte).toString('base64url');
// Syntactically valid but unusable key material. An unpaid request must never import it.
const invalidSigningKey = JSON.stringify({
  kty: 'EC', crv: 'P-256', x: b64(1), y: b64(2), d: b64(3)
});

function environment() {
  return {
    X402_PAY_TO: payTo,
    CDP_API_KEY_ID: 'test-id',
    CDP_API_KEY_SECRET: 'invalid-test-key',
    POPCORN_SIGNING_KEY_JWK: invalidSigningKey,
    POPCORN_WITNESS_SIGNING_KEY_JWK: invalidSigningKey,
    POPCORN_WITNESS_SIGNING_KEY_ID: 'test-witness-key',
    POPCORN_WITNESS_SERVICE_STATE: 'available'
  };
}

function unreadRequest(path, options = {}) {
  const request = new Request(origin + path, options);
  Object.defineProperty(request, 'text', {
    value: () => { throw new Error('unpaid_body_was_read'); }
  });
  return request;
}

async function quickFetch(request, env) {
  let timer;
  try {
    return await Promise.race([
      worker.fetch(request, env, {}),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('unpaid_request_timed_out')), 1500);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function assertChallenge(response, expectedResource) {
  assert.equal(response.status, 402);
  const body = await response.json();
  assert.equal(body.x402Version, 2);
  assert.equal(body.error, 'payment_proof_required');
  assert.equal(body.resource.url, origin + expectedResource);
  assert.equal(body.accepts[0].amount, '1000');
  assert.equal(body.accepts[0].payTo.toLowerCase(), payTo);
  const encoded = response.headers.get('payment-required');
  assert.ok(encoded, 'PAYMENT-REQUIRED must be present');
  assert.equal(response.headers.get('x-payment-required'), encoded);
  const { payment_diagnostics: diagnostics, ...challenge } = body;
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), challenge);
  if (diagnostics) assert.equal(diagnostics.settlement_confirmed, false);
}

test('unpaid /v1/time challenges before key import and freshness validation', async () => {
  const env = environment();
  await assertChallenge(await quickFetch(unreadRequest('/v1/time'), env), '/v1/time');
  await assertChallenge(await quickFetch(unreadRequest('/v1/time?freshness_ms=invalid'), env), '/v1/time?freshness_ms=invalid');
});

test('unpaid /v1/receipt challenges before parsing valid unsupported JSON', async () => {
  const env = environment();
  const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"unsupported":true}' };
  await assertChallenge(await quickFetch(unreadRequest('/v1/receipt', options), env), '/v1/receipt');
});

test('unpaid /v1/receipt challenges before parsing an ordinary request', async () => {
  const env = environment();
  const body = JSON.stringify({
    nonce: b64(4),
    payload_digest: { algorithm: 'sha-256', value: b64(5) },
    previous_attestation_digest: null
  });
  const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body };
  await assertChallenge(await quickFetch(unreadRequest('/v1/receipt', options), env), '/v1/receipt');
});

function attachEngine(env, bindingName) {
  const records = new Map();
  const state = {
    blockConcurrencyWhile: callback => callback(),
    storage: {
      get: async key => records.get(key),
      put: async (key, value) => { records.set(key, value); }
    }
  };
  const engine = new BriarwoodAgentEngine(state, env);
  env[bindingName] = {
    idFromName: name => name,
    get: () => ({ fetch: request => engine.fetch(request) })
  };
}

for (const bindingName of ['Agent_Engine', 'AGENT_ENGINE']) {
  test(`health stays on its own free route with ${bindingName} binding`, async () => {
    const env = environment();
    attachEngine(env, bindingName);
    const response = await quickFetch(unreadRequest('/agent/status'), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.engine_state, 'ready');
    assert.equal(body.payment_configuration_state, 'ready');
  });

  test(`TAIN lookup uses the existing ${bindingName} binding`, async () => {
    const env = environment();
    attachEngine(env, bindingName);
    const tain = 'tain_' + '0'.repeat(26);
    const request = unreadRequest(`/v1/receipt/tain/${tain}`, {
      headers: { accept: 'application/json' }
    });
    const response = await quickFetch(request, env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'tain_not_found' });
  });
}
