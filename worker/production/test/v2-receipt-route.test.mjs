import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker, {verifyPopcornWitnessEvidence} from '../index.js';

const origin = 'https://767-2676.com';
const v1 = origin + '/v1/receipt';
const v2 = origin + '/v2/receipt';
const b64 = byte => Buffer.alloc(32, byte).toString('base64url');
const unusableKey = JSON.stringify({kty: 'EC', crv: 'P-256', x: b64(1), y: b64(1), d: b64(1)});
const body = JSON.stringify({
  payload_digest: {algorithm: 'sha-256', value: b64(2)},
  nonce: b64(3),
  previous_attestation_digest: null
});

function testEnv(overrides = {}) {
  return {
    POPCORN_SIGNING_KEY_JWK: unusableKey,
    POPCORN_WITNESS_SIGNING_KEY_JWK: unusableKey,
    POPCORN_WITNESS_SIGNING_KEY_ID: 'test-witness',
    POPCORN_WITNESS_SERVICE_STATE: 'available',
    POPCORN_WITNESS_CLOCK_ACCURACY_RADIUS_MS: '10000',
    X402_PAY_TO: '0x5f5a631e975183d084f60d7121e967b30ec83cb8',
    ...overrides
  };
}

function unreadableRequest(resource, payload) {
  const init = {method: 'POST', headers: {'content-type': 'application/json'}};
  if (payload !== undefined) init.body = payload;
  const request = new Request(resource, init);
  const fail = () => { throw new Error('unpaid body was read'); };
  for (const method of ['text', 'json', 'arrayBuffer', 'blob', 'formData', 'clone']) {
    Object.defineProperty(request, method, {value: fail});
  }
  Object.defineProperty(request, 'body', {get: fail});
  return request;
}

function challenge(response) {
  const encoded = response.headers.get('payment-required');
  assert.ok(encoded, 'missing x402 challenge');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

for (const [label, payload] of [
  ['empty', undefined],
  ['malformed', '{'],
  ['supported', body],
  ['unsupported', '{"unsupported":true}']
]) {
  test(`unpaid v2 ${label} request receives a path-bound 402 before body access`, async () => {
    let facilitatorCalls = 0;
    const env = testEnv({X402_FACILITATOR: {fetch() {
      facilitatorCalls++;
      throw new Error('unpaid request reached facilitator');
    }}});
    const response = await worker.fetch(unreadableRequest(v2, payload), env, {});
    assert.equal(response.status, 402);
    assert.equal(response.headers.get('x-popcorn-protocol'), 'POPCORN-WITNESS/2.0');
    const required = challenge(response);
    assert.equal(required.resource.url, v2);
    assert.equal(required.extensions['popcorn-witness'].info.protocol_id, 'POPCORN-WITNESS/2.0');
    assert.equal(required.extensions['popcorn-witness'].info.response_schema,
      origin + '/schemas/witness-response.v2.json');
    assert.equal(facilitatorCalls, 0);
  });
}

test('a v1 payment proof cannot be replayed at the v2 resource', async () => {
  let facilitatorCalls = 0;
  const env = testEnv({X402_FACILITATOR: {fetch() {
    facilitatorCalls++;
    throw new Error('mismatched proof reached facilitator');
  }}});
  const v1Response = await worker.fetch(new Request(v1, {method: 'POST'}), env, {});
  assert.equal(v1Response.status, 402);
  const requirement = challenge(v1Response);
  assert.equal(requirement.resource.url, v1);
  const proof = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: requirement.accepts[0],
    resource: {url: v1},
    payload: {signature: 'test-only', authorization: {nonce: '0x' + '3'.repeat(64)}}
  })).toString('base64');
  const response = await worker.fetch(new Request(v2, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'payment-signature': proof},
    body
  }), env, {});
  assert.equal(response.status, 402);
  assert.equal((await response.json()).error, 'invalid_payment_requirements');
  assert.equal(facilitatorCalls, 0);
});

test('mock-settled v2 receipt signs the issued path and verifies locally', async () => {
  const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const operations = [];
  const env = testEnv({
    POPCORN_WITNESS_SIGNING_KEY_JWK: JSON.stringify(privateJwk),
    X402_FACILITATOR: {async fetch(request) {
      const operation = new URL(request.url).pathname.slice(1);
      operations.push(operation);
      await request.json();
      return Response.json(operation === 'verify'
        ? {isValid: true}
        : {success: true, transaction: '0x' + '4'.repeat(64), network: 'eip155:8453'});
    }},
    AGENT_ENGINE: {
      idFromName: name => name,
      get: () => ({fetch: async request => {
        await request.json();
        return Response.json({outcome: 'stored'}, {status: 201});
      }})
    }
  });
  const unpaid = await worker.fetch(new Request(v2, {method: 'POST'}), env, {});
  assert.equal(unpaid.status, 402);
  const requirement = challenge(unpaid);
  const proof = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: requirement.accepts[0],
    resource: {url: v2},
    payload: {signature: 'test-only-mocked-facilitator', authorization: {nonce: '0x' + '3'.repeat(64)}}
  })).toString('base64');
  const paid = await worker.fetch(new Request(v2, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'payment-signature': proof},
    body
  }), env, {});
  assert.equal(paid.status, 200);
  assert.deepEqual(operations, ['verify', 'settle']);
  const evidence = await paid.json();
  assert.equal(evidence.witness_receipt.protocol_id, 'POPCORN-WITNESS/2.0');
  assert.equal(evidence.witness_receipt.issuance_endpoint, '/v2/receipt');
  assert.match(evidence.witness_receipt.tain_verification_uri, /\/v1\/receipt\/tain\//);
  const {kty, crv, x, y} = publicJwk;
  const verified = await verifyPopcornWitnessEvidence(evidence, {
    keys: [{kty, crv, x, y, use: 'sig', alg: 'ES256',
      kid: 'test-witness', popcorn_protocol: 'POPCORN-WITNESS/1.0'}]
  }, {
    expected_nonce: JSON.parse(body).nonce,
    expected_payload_digest: JSON.parse(body).payload_digest,
    max_clock_accuracy_radius_ms: 10000,
    expected_node_id: '767-2676.com'
  });
  assert.equal(verified.valid, true, JSON.stringify(verified));
});
