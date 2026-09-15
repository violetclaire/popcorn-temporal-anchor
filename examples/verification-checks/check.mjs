import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseTaskSchedule, evaluateTaskSchedule, verifyPopcornWitnessEvidence } from './verifier.mjs';

// No network, wallet or executor is used. Expectations never enter compute().
globalThis.fetch = () => { throw Error('Offline checker: network prohibited'); };
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const vectors = JSON.parse(fs.readFileSync(process.argv[2] ?? new URL('./vectors.json', import.meta.url), 'utf8'));
const sample = read('../task-schedule/packet.json');
const historical = read('../witness/evaluation-packet.proceed-002.production.json');
const sha = bytes => createHash('sha256').update(bytes).digest('base64url');
const num = x => x === 'NaN' ? NaN : x === 'Infinity' ? Infinity : x === '-Infinity' ? -Infinity : x;
async function compute(input) {
  if (input.kind === 'evaluate') {
    return evaluateTaskSchedule(parseTaskSchedule(Buffer.from(vectors.schedule)), num(input.L), num(input.U), input.condition);
  }
  if (input.kind === 'parse') {
    let bytes = Buffer.from(vectors.schedule);
    if (input.mutation === 'bom') bytes = Buffer.concat([Buffer.from([239,187,191]), bytes]);
    if (input.mutation === 'invalid-utf8') bytes[bytes.indexOf('who: ') + 5] = 255;
    if (input.mutation === 'no-final-lf') bytes = bytes.subarray(0, -1);
    if (input.mutation === 'crlf') bytes = Buffer.from(bytes.toString().replaceAll('\n', '\r\n'));
    if (input.mutation === 'extra-field') bytes = Buffer.concat([bytes, Buffer.from('extra: yes\n')]);
    if (input.mutation === 'missing-who') bytes = Buffer.from(bytes.toString().replace('who: test operator\n', ''));
    parseTaskSchedule(bytes);
    return 'VALID';
  }
  if (input.kind === 'historical') {
    const bytes = Buffer.from(historical.exact_schedule.bytes, 'base64url');
    // The historical fixture is JSON plus LF, NOT the later eight-line schema.
    return { bytes: bytes.length, digest: sha(bytes) };
  }
  if (input.kind === 'historical-signature') {
    const result = await verifyPopcornWitnessEvidence(historical.paid_evidence,
      { keys: [historical.public_verification_key] }, {
        expected_payload: Buffer.from(historical.exact_schedule.bytes, 'base64url'),
        expected_nonce: historical.submitted_request.nonce,
        max_clock_accuracy_radius_ms: 10000,
      });
    return result.signature_verified && result.payload_digest_verified && result.nonce_verified ? 'VERIFIED' : 'INVALID';
  }
  const response = structuredClone(sample.witness_response);
  const jwks = structuredClone(sample.jwks_at_verification);
  const options = { expected_payload: Buffer.from(sample.schedule_base64url, 'base64url'), expected_nonce: sample.nonce,
    expected_node_id: '767-2676.com', max_clock_accuracy_radius_ms: 10000 };
  if (input.mutation === 'payload') options.expected_payload[0] ^= 1;
  if (input.mutation === 'nonce') options.expected_nonce = 'A'.repeat(43);
  if (input.mutation === 'missing-nonce') delete options.expected_nonce;
  if (input.mutation === 'missing-payload') delete options.expected_payload;
  if (input.mutation === 'scope') response.witness_receipt.evidence_scope.authorization_granted = true;
  if (input.mutation === 'extra-field') response.witness_receipt.extra = true;
  if (input.mutation === 'key') jwks.keys = [];
  if (input.mutation === 'radius') options.max_clock_accuracy_radius_ms = 0;
  if (input.mutation === 'signature') {
    const parts = response.witness_attestation.compact_jws.split('.');
    const sig = Buffer.from(parts[2], 'base64url'); sig[0] ^= 1;
    parts[2] = sig.toString('base64url'); response.witness_attestation.compact_jws = parts.join('.');
  }
  await verifyPopcornWitnessEvidence(response, jwks, options);
  if (input.mutation === 'repeat-verification') await verifyPopcornWitnessEvidence(response, jwks, options);
  return 'VERIFIED';
}
let failures = 0;
for (const { id, input, expected } of vectors.cases) {
  let actual;
  try { actual = await compute(input); } catch (error) { actual = { error: error.message }; }
  const pass = expected.errorIncludes !== undefined
    ? typeof actual?.error === 'string' && actual.error.includes(expected.errorIncludes)
    : JSON.stringify(actual) === JSON.stringify(expected.value);
  if (!pass) failures++;
  console.log(JSON.stringify({ id, pass, expected, actual }));
}
console.log(JSON.stringify({ passed: vectors.cases.length - failures, failed: failures, network_requests: 0,
  payments: 0, actions_executed: 0, scope: 'Offline code checks and historical evidence; no live authorization or settlement verification.' }));
process.exitCode = failures ? 1 : 0;
