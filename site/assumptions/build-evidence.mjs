import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = root;
const out = path.dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const names = ['examples/witness/evaluation-packet.production.json', 'examples/witness/evaluation-packet.proceed-002.production.json'];
const outcomePath = 'examples/witness/evaluation-outcomes.json';
const verifierPath = 'verify/typescript/src/index.ts';
const sourceNames = [...names, outcomePath, verifierPath];
const read = name => fs.readFileSync(path.join(repo, name), 'utf8');
const outcomes = JSON.parse(read(outcomePath));
const records = names.map(name => {
  const packet = JSON.parse(read(name));
  const bytes = Buffer.from(packet.exact_schedule.bytes, 'base64url');
  const schedule = JSON.parse(bytes.toString('utf8'));
  const mutation = packet.expected_verification.one_byte_tamper;
  const changed = Buffer.from(mutation.tampered_bytes, 'base64url');
  assert.equal(bytes.length, packet.exact_schedule.byte_length);
  assert.equal(createHash('sha256').update(bytes).digest('base64url'), packet.exact_schedule.payload_digest.value);
  assert.equal(changed.length, bytes.length);
  assert.deepEqual([...bytes.keys()].filter(i => bytes[i] !== changed[i]), [mutation.tampered_byte_offset]);
  const publishedOutcome = outcomes.examples.find(item => item.schedule_id === schedule.schedule_id);
  assert(publishedOutcome, 'Missing published historical outcome');
  return { sourcePath: name, sourceUrl: 'https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/' + name, packet, publishedOutcome };
});
const evidence = {
  format: 'POPCORN-ASSUMPTIONS/1.0',
  historical: true,
  keyTrustDisclosure: 'The archived public keys reproduce these saved signatures. Independent issuer trust, current time, consent and task execution are not established.',
  outcomeDisclosure: 'Published outcome labels are unsigned historical local policy metadata. The current verifier requires the whole witness interval inside the task window. PROCEED means that historical local time check passed, not authorization or execution.',
  signatureControl: { byteOffset: 0, operation: 'XOR 1', publishedFixture: false, description: 'Interactive control: flip the first byte of the receipt signature.' },
  records
};
const shim = `// Browser byte adapter only. The maintained verifier below is transpiled without logic changes.
const Buffer = { from(value, encoding) {
  let bytes;
  if (typeof value === 'string') {
    if (encoding === 'base64url') {
      const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
      bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    } else if (!encoding || encoding === 'utf8') bytes = new TextEncoder().encode(value);
    else throw new Error('Unsupported byte encoding');
  } else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
  else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  else throw new Error('Unsupported byte input');
  bytes.toString = function(format = 'utf8') {
    if (format === 'utf8') return new TextDecoder('utf-8', { ignoreBOM: true }).decode(this);
    if (format !== 'base64url') throw new Error('Unsupported byte encoding');
    let binary = ''; for (const byte of this) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  };
  return bytes;
} };
`;
const verifierBody = stripTypeScriptTypes(read(verifierPath), { mode: 'transform' });
assert(!/^import\b/m.test(verifierBody), 'Verifier gained an import; review browser build');
const verifier = '// Copyright 2026 Violet Herod. Preserve POPCORN Read-and-Use Terms and LICENSING.md.\n' + shim + verifierBody;
const model = `import { evidence } from './evidence.mjs';
import { verifyPopcornWitnessEvidence, evaluateWitnessAgainstSchedule } from './verifier.mjs';

const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
const encode = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };
const describe = bytes => ({ base64url: encode(bytes), utf8: new TextDecoder().decode(bytes), byteLength: bytes.length });
const sha256 = async bytes => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));

export async function evaluateSelection(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Selection must be an object');
  for (const key of Object.keys(input)) if (!['recordIndex', 'taskChanged', 'signatureChanged'].includes(key)) throw new TypeError('Unknown selection field: ' + key);
  const { recordIndex = 1, taskChanged = false, signatureChanged = false } = input;
  if (![0, 1].includes(recordIndex) || typeof taskChanged !== 'boolean' || typeof signatureChanged !== 'boolean') throw new TypeError('Choose record 0 or 1 and boolean controls');
  const record = evidence.records[recordIndex];
  const packet = record.packet;
  const exact = decode(packet.exact_schedule.bytes);
  const received = taskChanged ? decode(packet.expected_verification.one_byte_tamper.tampered_bytes) : exact.slice();
  const originalTask = JSON.parse(new TextDecoder().decode(exact));
  const candidate = structuredClone(packet.paid_evidence);
  const parts = candidate.witness_attestation.compact_jws.split('.');
  if (signatureChanged) { const signature = decode(parts[2]); signature[0] ^= 1; parts[2] = encode(signature); candidate.witness_attestation.compact_jws = parts.join('.'); }
  const receivedDigest = await sha256(received);
  const result = {
    selection: { recordIndex, taskChanged, signatureChanged },
    decision: 'STOP', code: 'not_verified', reason: 'Evidence has not passed verification.',
    recordId: originalTask.schedule_id, taskDescription: originalTask.task, owner: originalTask.owner,
    agreementInterval: { ...originalTask.execution_window_utc },
    witnessedAt: null, witnessInterval: null, timingTrusted: false,
    claimedWitnessedAt: packet.paid_evidence.witness_receipt.witnessed_at_utc,
    claimedWitnessInterval: { ...packet.paid_evidence.witness_receipt.witness_window_utc },
    signatureVerified: false, digestMatches: receivedDigest === packet.exact_schedule.payload_digest.value,
    receivedDigest, committedDigest: packet.exact_schedule.payload_digest.value, commitmentTrusted: false,
    exactTask: describe(exact), receivedTask: describe(received),
    compactJws: parts.join('.'), signatureBase64url: parts[2], keyId: packet.public_verification_key.kid,
    cryptographicVerified: false, error: null, historical: true,
    authorizationGranted: false, actionExecutionProven: false,
    keyTrustDisclosure: evidence.keyTrustDisclosure, policyDisclosure: evidence.outcomeDisclosure,
    sourceUrl: record.sourceUrl, publishedTaskMutationByteOffset: packet.expected_verification.one_byte_tamper.tampered_byte_offset,
    signatureMutationByteOffset: signatureChanged ? 0 : null, evaluatorDecision: null
  };
  const jwks = { keys: [packet.public_verification_key] };
  const options = { expected_payload: exact, expected_nonce: packet.submitted_request.nonce, expected_node_id: '767-2676.com', max_clock_accuracy_radius_ms: 10000 };
  let verified;
  try {
    verified = await verifyPopcornWitnessEvidence(candidate, jwks, options);
    result.signatureVerified = true;
    result.commitmentTrusted = true;
    result.witnessedAt = verified.witness_receipt.witnessed_at_utc;
    result.witnessInterval = { ...verified.witness_window_utc };
    result.timingTrusted = true;
    result.committedDigest = verified.witness_receipt.commitment.payload_digest.value;
    result.digestMatches = receivedDigest === result.committedDigest;
  } catch (error) {
    result.code = 'signature_invalid';
    result.reason = 'The receipt signature does not check out. Its claimed timing is untrusted.';
    result.error = error.message;
    return result;
  }
  try {
    await verifyPopcornWitnessEvidence(candidate, jwks, { ...options, expected_payload: received });
    result.cryptographicVerified = true;
  } catch (error) {
    result.code = 'task_digest_mismatch';
    result.reason = 'The signature checks out, but the received task bytes do not match its commitment.';
    result.error = error.message;
    return result;
  }
  const judged = evaluateWitnessAgainstSchedule(verified.witness_window_utc, originalTask.execution_window_utc);
  result.evaluatorDecision = judged.decision;
  result.code = judged.reason;
  result.decision = judged.decision === 'TIME_CHECK_PASSED' ? 'PROCEED' : 'STOP';
  result.reason = result.decision === 'PROCEED'
    ? 'The exact task checks out and the whole witnessed interval falls inside its task window. The historical local time policy passes.'
    : 'The exact task checks out, but the witnessed interval falls outside its task window. The historical local time policy stops.';
  return result;
}
`;
fs.mkdirSync(out, { recursive: true });
const outputs = {
  'verifier.mjs': verifier,
  'evidence.json': JSON.stringify(evidence, null, 2) + '\n',
  'evidence.mjs': 'const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };\nexport const evidence = freeze(' + JSON.stringify(evidence) + ');\nexport const records = evidence.records;\n',
  'model.mjs': model
};
for (const [file, content] of Object.entries(outputs)) fs.writeFileSync(path.join(out, file), content);
const sources = {
  format: 'POPCORN-ASSUMPTIONS-SOURCES/1.0',
  sources: Object.fromEntries(sourceNames.map(name => [name, hash(fs.readFileSync(path.join(repo, name)))])),
  outputs: Object.fromEntries(Object.entries(outputs).map(([name, body]) => [name, hash(body)])),
  verifierTranspiledSha256: hash(verifierBody),
  browserAdapter: 'Module-local Buffer.from/toString subset backed by atob, btoa, TextEncoder and TextDecoder. Maintained verifier logic unchanged.',
  policyMapping: 'TIME_CHECK_PASSED -> PROCEED, all other decisions -> STOP. Historical local policy only.',
  noNetwork: true,
  sourceRepository: 'https://github.com/violetclaire/popcorn-temporal-anchor'
};
fs.writeFileSync(path.join(out, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
console.log(JSON.stringify({ built: true, records: records.length, outputs: Object.keys(outputs), sourceHashes: sources.sources }));
