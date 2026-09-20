import { evidence } from './evidence.mjs';
import { verifyPopcornWitnessEvidence, evaluateWitnessAgainstSchedule } from './verifier.mjs';

const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
const encode = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
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
