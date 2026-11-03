import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes);
const sampleBytes = fs.readFileSync(new URL('./sample-v2.json', import.meta.url));
const sampleSha256 = sha256(sampleBytes).digest('hex');
assert.equal(sampleSha256,
  '520af4287f34e9091cbf77ba72998193cfbfff53d5fb429da159ecbd34870937',
  'the pinned sample file changed');
const sample = JSON.parse(sampleBytes.toString('utf8'));
const exactPayload = Buffer.from(sample.payload_utf8, 'utf8');
assert.equal(exactPayload.length, 113, 'sample payload byte count changed');
const digest = bytes => sha256(bytes).digest('base64url');
assert.equal(digest(exactPayload), sample.input.expected_payload_digest,
  'sample payload does not match its recorded digest');

const licenseBytes = fs.readFileSync(new URL('./contribution-1.0.txt', import.meta.url));
const licenseDigest = digest(licenseBytes);
assert.equal(licenseDigest, sample.input.response.witness_receipt.license_terms_digest.value,
  'license bytes do not match the signed receipt digest');

let fetchAttempts = 0;
globalThis.fetch = () => {
  fetchAttempts++;
  throw new Error('Offline sample: network prohibited');
};
const {verifyV2} = await import('../../packages/mcp/src/v2-interface.ts');
const verifyBytes = bytes => verifyV2({
  ...sample.input,
  expected_payload_digest: digest(bytes),
});

const original = await verifyBytes(exactPayload);
assert.equal(original.accepted, true, `original receipt rejected: ${original.reason}`);
const tampered = Buffer.from(exactPayload);
tampered[0] ^= 1;
const changedByte = await verifyBytes(tampered);
assert.equal(changedByte.accepted, false, 'one-byte change was accepted');
assert.match(changedByte.reason, /digest/i, 'one-byte change failed for an unexpected reason');
assert.equal(fetchAttempts, 0, 'the verifier attempted a network fetch');

console.log(JSON.stringify({
  protocol_id: 'POPCORN-WITNESS/2.0',
  sample_kind: sample.kind,
  sample_sha256: sampleSha256,
  exact_payload_bytes: exactPayload.length,
  license_bytes: licenseBytes.length,
  license_digest_matches_signed_receipt: true,
  original: {accepted: original.accepted, reason: original.reason},
  one_byte_change: {accepted: changedByte.accepted, reason: changedByte.reason},
  issuer_key_trust_checked_by_tool: original.issuer_key_trust_checked_by_tool,
  on_chain_settlement_checked_by_tool: original.on_chain_settlement_checked_by_tool,
  fetch_attempts: fetchAttempts,
}, null, 2));
