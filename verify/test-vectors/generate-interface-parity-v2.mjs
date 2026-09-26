// Rebuild the synthetic interface conformance packets. Never use this fixture key
// for a real receipt; all output files are marked test_only and prove no payment.
import { createPrivateKey, sign } from 'node:crypto';
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

const input = {
  response: source.paid_evidence,
  jwks: { keys: [source.public_verification_key] },
  expected_nonce: source.submitted_request.nonce,
  expected_payload_base64url: source.exact_payload.bytes,
  expected_node_id: '767-2676.com',
  max_clock_accuracy_radius_ms: 10000,
};
const changedSignature = structuredClone(input);
const segments = changedSignature.response.witness_attestation.compact_jws.split('.');
segments[2] = (segments[2][0] === 'A' ? 'B' : 'A') + segments[2].slice(1);
changedSignature.response.witness_attestation.compact_jws = segments.join('.');
const changedPayload = structuredClone(input);
const bytes = Buffer.from(changedPayload.expected_payload_base64url, 'base64url');
bytes[0] ^= 1;
changedPayload.expected_payload_base64url = bytes.toString('base64url');
const changedInterval = { ...structuredClone(input), response: resigned(receipt => {
  receipt.witness_window_utc.earliest = '2026-09-22T18:00:00.011Z';
}) };
const missingField = { ...structuredClone(input), response: resigned(receipt => {
  delete receipt.tain;
}) };
const radiusPolicy = { ...structuredClone(input), max_clock_accuracy_radius_ms: 999 };

const cases = [
  ['00-valid', 'valid evidence', true, 'signature, digest, time interval, and required fields verified', input],
  ['10-signature-invalid', 'signature', false, 'ES256 witness receipt signature is invalid', changedSignature],
  ['20-digest-mismatch', 'digest', false, 'receipt payload digest does not match the expected payload', changedPayload],
  ['30-time-interval-invalid', 'time interval', false, 'witness_window_utc signed relationship is invalid', changedInterval],
  ['31-time-policy-rejects', 'time interval', false, 'witness clock accuracy exceeds local policy', radiusPolicy],
  ['40-required-field-missing', 'required fields', false, 'witness_receipt contains missing or unsupported fields', missingField],
];
for (const [id, category, accepted, reason, caseInput] of cases) {
  const packet = { test_only: true, id, category, expected: { accepted, reason }, input: caseInput };
  await writeFile(new URL(`${id}.json`, outputDir), `${JSON.stringify(packet, null, 2)}\n`);
}
console.log(`Wrote ${cases.length} synthetic interface parity vectors`);
