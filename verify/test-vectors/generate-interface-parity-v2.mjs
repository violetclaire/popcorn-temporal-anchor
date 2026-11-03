// Rebuild the synthetic interface conformance packets. Never use this fixture key
// for a real receipt; all output files are marked test_only and prove no payment.
import { createECDH, createHash, createPrivateKey, sign } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('./popcorn-witness-receipt-v2.json', import.meta.url), 'utf8'));
if (source.test_only !== true || source.paid_evidence.witness_receipt.payment_transaction !== null) {
  throw new Error('Refusing to derive interface tests from non-synthetic evidence');
}
const outputDir = new URL('./interface-parity-v2/', import.meta.url);
await mkdir(outputDir, { recursive: true });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resigned(mutator) {
  const response = structuredClone(source.paid_evidence);
  mutator(response.witness_receipt);
  const header = response.witness_attestation.compact_jws.split('.')[0];
  const payload = Buffer.from(canonical(response.witness_receipt)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC', crv: 'P-256', x: source.public_verification_key.x,
      y: source.public_verification_key.y,
      d: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE',
    },
  });
  const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  response.witness_attestation.compact_jws = `${signingInput}.${signature.toString('base64url')}`;
  return response;
}

function ulidTimestamp(milliseconds) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const chars = Array(10);
  let remaining = BigInt(milliseconds);
  for (let index = 9; index >= 0; index--) {
    chars[index] = alphabet[Number(remaining & 31n)];
    remaining >>= 5n;
  }
  return chars.join('');
}

const payloadDigest = createHash('sha256').update(Buffer.from(source.exact_payload.bytes, 'base64url')).digest('base64url');

const input = {
  response: source.paid_evidence,
  jwks: { keys: [source.public_verification_key] },
  expected_nonce: source.submitted_request.nonce,
  expected_payload_digest: payloadDigest,
  expected_node_id: '767-2676.com',
  max_clock_accuracy_radius_ms: 10000,
};
const changedSignature = structuredClone(input);
const segments = changedSignature.response.witness_attestation.compact_jws.split('.');
segments[2] = (segments[2][0] === 'A' ? 'B' : 'A') + segments[2].slice(1);
changedSignature.response.witness_attestation.compact_jws = segments.join('.');
// A valid JWS under a substitute key with the *same kid* must still fail when
// the caller supplies the original key's independently obtained thumbprint.
// Without that pin, this deliberately verifies and demonstrates the trust limit.
const substituteScalar = Buffer.alloc(32);
substituteScalar[31] = 2;
const substituteEcdh = createECDH('prime256v1');
substituteEcdh.setPrivateKey(substituteScalar);
const substitutePoint = substituteEcdh.getPublicKey(undefined, 'uncompressed');
const substituteJwk = {
  kty: 'EC', crv: 'P-256',
  x: substitutePoint.subarray(1, 33).toString('base64url'),
  y: substitutePoint.subarray(33, 65).toString('base64url'),
  d: substituteScalar.toString('base64url'),
};
const substituteKey = createPrivateKey({ format: 'jwk', key: substituteJwk });
const substitutedKey = structuredClone(input);
substitutedKey.jwks.keys[0].x = substituteJwk.x;
substitutedKey.jwks.keys[0].y = substituteJwk.y;
const substituteSegments = substitutedKey.response.witness_attestation.compact_jws.split('.');
const substituteSigningInput = `${substituteSegments[0]}.${substituteSegments[1]}`;
substituteSegments[2] = sign('sha256', Buffer.from(substituteSigningInput), {
  key: substituteKey, dsaEncoding: 'ieee-p1363',
}).toString('base64url');
substitutedKey.response.witness_attestation.compact_jws = substituteSegments.join('.');
const originalJwk = source.public_verification_key;
const originalKeyThumbprint = createHash('sha256').update(JSON.stringify({
  crv: originalJwk.crv, kty: originalJwk.kty, x: originalJwk.x, y: originalJwk.y,
})).digest('base64url');
const validPinnedInput = {
  ...structuredClone(input),
  expected_issuer_key_thumbprint_sha256: originalKeyThumbprint,
};
const substitutedKeyPinned = {
  ...structuredClone(substitutedKey),
  expected_issuer_key_thumbprint_sha256: originalKeyThumbprint,
};
const changedPayload = structuredClone(input);
changedPayload.expected_payload_digest = (payloadDigest[0] === 'A' ? 'B' : 'A') + payloadDigest.slice(1);
const changedInterval = { ...structuredClone(input), response: resigned(receipt => {
  receipt.witness_window_utc.earliest = '2026-09-22T18:00:00.011Z';
}) };
const missingField = { ...structuredClone(input), response: resigned(receipt => {
  delete receipt.tain;
}) };
const radiusPolicy = { ...structuredClone(input), max_clock_accuracy_radius_ms: 999 };

const signedPayload = Buffer.from(source.paid_evidence.witness_attestation.compact_jws.split('.')[1], 'base64url');
const predecessorDigest = createHash('sha256').update(signedPayload).digest('base64url');
const chainedResponse = resigned(receipt => {
  const witnessedMs = Date.parse(receipt.witnessed_at_utc) + 1;
  const statementMs = Date.parse(receipt.statement_created_at_utc) + 1;
  receipt.receipt_id = 'pwr_11111111111111111111111111111111';
  receipt.tain = `tain_${ulidTimestamp(witnessedMs)}${receipt.tain.slice(15)}`;
  receipt.tain_verification_uri = `https://767-2676.com/v1/receipt/tain/${receipt.tain}`;
  receipt.witnessed_at_utc = new Date(witnessedMs).toISOString();
  receipt.statement_created_at_utc = new Date(statementMs).toISOString();
  receipt.unix_time_milliseconds = witnessedMs;
  receipt.witness_window_utc.earliest = new Date(Date.parse(receipt.witness_window_utc.earliest) + 1).toISOString();
  receipt.witness_window_utc.latest = new Date(Date.parse(receipt.witness_window_utc.latest) + 1).toISOString();
  receipt.server_processing_duration_ms += 1;
  receipt.commitment.nonce = createHash('sha256').update('test-only-chain-current-nonce').digest('base64url');
  receipt.commitment.previous_attestation_digest = { algorithm: 'sha-256', value: predecessorDigest };
  receipt.payment_identifier = `eip3009_${'1'.repeat(64)}`;
});
// Presentation fields are outside the signed payload and are not needed for chain verification.
delete chainedResponse.tain_qr_png_base64;
delete chainedResponse.tain_qr_payload;
delete chainedResponse.letterhead_uri;
const chainInput = {
  ...structuredClone(input),
  response: chainedResponse,
  expected_nonce: chainedResponse.witness_receipt.commitment.nonce,
  previous_receipt: {
    response: source.paid_evidence,
    jwks: input.jwks,
    verification: {
      expected_nonce: source.submitted_request.nonce,
      expected_payload_digest: payloadDigest,
      expected_node_id: '767-2676.com',
      max_clock_accuracy_radius_ms: 10000,
    },
  },
};
const brokenPredecessor = structuredClone(chainInput);
const predecessorParts = brokenPredecessor.previous_receipt.response.witness_attestation.compact_jws.split('.');
predecessorParts[2] = (predecessorParts[2][0] === 'A' ? 'B' : 'A') + predecessorParts[2].slice(1);
brokenPredecessor.previous_receipt.response.witness_attestation.compact_jws = predecessorParts.join('.');

const cases = [
  ['00-valid', 'valid evidence with issuer key pin', true, 'signature, digest, time interval, and required fields verified', validPinnedInput],
  ['10-signature-invalid', 'signature', false, 'ES256 witness receipt signature is invalid', changedSignature],
  ['11-key-substitution-pinned', 'issuer key pin', false, 'JWKS key material does not match expected issuer key thumbprint', substitutedKeyPinned],
  ['12-key-substitution-unpinned', 'issuer key trust limit', true, 'signature, digest, time interval, and required fields verified', substitutedKey],
  ['20-digest-mismatch', 'digest', false, 'receipt payload digest does not match the expected payload', changedPayload],
  ['30-time-interval-invalid', 'time interval', false, 'witness_window_utc signed relationship is invalid', changedInterval],
  ['31-time-policy-rejects', 'time interval', false, 'witness clock accuracy exceeds local policy', radiusPolicy],
  ['40-required-field-missing', 'required fields', false, 'witness_receipt contains missing or unsupported fields', missingField],
  ['50-valid-chain', 'valid predecessor chain', true, 'signature, digest, time interval, and required fields verified', chainInput],
  ['51-broken-predecessor', 'predecessor signature', false, 'previous receipt verification failed: ES256 witness receipt signature is invalid', brokenPredecessor],
];
for (const [id, category, accepted, reason, caseInput] of cases) {
  const packet = { test_only: true, id, category, expected: { accepted, reason }, input: caseInput };
  await writeFile(new URL(`${id}.json`, outputDir), `${JSON.stringify(packet, null, 2)}\n`);
}
console.log(`Wrote ${cases.length} synthetic interface parity vectors`);
