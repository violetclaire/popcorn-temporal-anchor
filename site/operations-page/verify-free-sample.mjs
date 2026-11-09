// Offline checks for the retained October 14, 2026 sample only. No network or payments.
// Usage: node verifier.mjs packet.json NEW-output-directory
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const EXPECTED = Object.freeze({
  checkpointBytes: 385,
  checkpointSha256: '03eecd1ed8866d816e183834fbf7f94543ecca18d0a1adc0f3b798252e6058a2',
  jwsSha256: '79aa3041086b4cd16cb1c6d9c3257b8a9e681d645bc75c478a0ec6f74d850e40',
  kid: 'popcorn-witness-2026-01',
  x: 'bPF-sxkcKCem33P9aAiwuQZlQOaHJzUWc1FxEE6kNhs',
  y: 'wQwlxsexe7-4J79qQmpuebyS4GmN0gqrPyN-XfpVAQA',
  receiptId: 'pwr_eb7e440aaff765e9d803c42d96c171c6',
  tain: 'tain_01M4YBT3FSPW08EWE0MGPN2WCT',
  nonce: 'WRfPcCqfujj3OOXHMoirn9VKbfhNf99gNeTHGXQ1SII',
  witnessed: '2026-10-14T23:26:25.273Z',
  tsrBytes: 4643,
  tsrSha256: 'd4213e71c60a1a23bdd0cade0f57288ef3fb096848127c6a6e779a26d0f8ea8c',
  rootSha256: '2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438',
  signerSha256: '8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467'
});
const sha = value => createHash('sha256').update(value).digest('hex');
function decode(text, encoding) {
  assert.equal(typeof text, 'string');
  assert(text.length > 0 && text.length < 100000);
  assert((encoding === 'base64url' ? /^[A-Za-z0-9_-]+$/ : /^[A-Za-z0-9+/]+={0,2}$/).test(text));
  const bytes = Buffer.from(text, encoding);
  assert.equal(bytes.toString(encoding), text, 'Noncanonical encoding');
  return bytes;
}
const parsePart = text => JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(decode(text, 'base64url')));
function utc(text) {
  assert.equal(typeof text, 'string');
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text));
  const value = Date.parse(text);
  assert(Number.isFinite(value));
  assert.equal(new Date(value).toISOString(), text);
  return value;
}

export function verifyPacket(packet) {
  const checks = [];
  const check = (name, run) => {
    try { run(); checks.push({name, status:'PASS'}); }
    catch { checks.push({name, status:'FAIL'}); }
  };
  let checkpoint, receipt, parts, signed, publicKey, tsr, demonstration;
  check('historical_sample_metadata', () => {
    assert.equal(packet.evaluation_only, true);
    assert.equal(packet.historical_evidence_date_utc, '2026-10-14');
    assert.equal(packet.new_payment_authorized, false);
  });
  check('exact_checkpoint_bytes_and_sha256', () => {
    assert.equal(packet.exact_checkpoint.encoding, 'base64url');
    checkpoint = decode(packet.exact_checkpoint.bytes, 'base64url');
    assert.equal(checkpoint.length, EXPECTED.checkpointBytes);
    assert.equal(packet.exact_checkpoint.byte_length, checkpoint.length);
    assert.equal(sha(checkpoint), EXPECTED.checkpointSha256);
    assert.equal(packet.exact_checkpoint.sha256_hex, EXPECTED.checkpointSha256);
    assert.equal(new TextDecoder('utf-8', {fatal:true}).decode(checkpoint), packet.exact_checkpoint.utf8_for_reading);
  });
  check('original_compact_jws_and_pinned_header', () => {
    const attestation = packet.popcorn_response.witness_attestation;
    assert.equal(attestation.format, 'JWS');
    assert.equal(attestation.algorithm, 'ES256');
    assert.equal(attestation.key_id, EXPECTED.kid);
    assert.equal(attestation.key_set, '/.well-known/popcorn-keys.json');
    assert.equal(typeof attestation.compact_jws, 'string');
    parts = attestation.compact_jws.split('.');
    assert.equal(parts.length, 3);
    assert.deepEqual(parsePart(parts[0]), {alg:'ES256', kid:EXPECTED.kid, typ:'popcorn-witness+jws'});
    signed = parsePart(parts[1]);
    assert.equal(decode(parts[2], 'base64url').length, 64);
    assert.equal(sha(attestation.compact_jws), EXPECTED.jwsSha256);
  });
  check('included_key_matches_retained_public_key', () => {
    assert(Array.isArray(packet.popcorn_public_keys.keys));
    const matches = packet.popcorn_public_keys.keys.filter(key => key.kid === EXPECTED.kid);
    assert.equal(matches.length, 1);
    const key = matches[0];
    assert.equal(key.kty, 'EC'); assert.equal(key.crv, 'P-256');
    assert.equal(key.alg, 'ES256'); assert.equal(key.use, 'sig');
    assert.equal(key.x, EXPECTED.x); assert.equal(key.y, EXPECTED.y);
    assert.equal(key.d, undefined);
    publicKey = createPublicKey({key, format:'jwk'});
  });
  const signatureValid = () => verifySignature('sha256', Buffer.from(parts[0]+'.'+parts[1], 'ascii'),
    {key:publicKey, dsaEncoding:'ieee-p1363'}, decode(parts[2], 'base64url'));
  check('es256_signature_over_original_encoded_parts', () => assert.equal(signatureValid(), true));
  check('outer_receipt_equals_signed_payload', () => {
    receipt = packet.popcorn_response.witness_receipt;
    assert(signed && typeof signed === 'object');
    assert.deepEqual(receipt, signed);
  });
  check('signed_historical_identity_and_issuance_fields', () => {
    assert.equal(signed.receipt_id, EXPECTED.receiptId); assert.equal(signed.tain, EXPECTED.tain);
    assert.equal(signed.node_id, '767-2676.com'); assert.equal(signed.protocol_id, 'POPCORN-WITNESS/2.0');
    assert.equal(signed.issuing_origin, 'https://767-2676.com'); assert.equal(signed.issuance_endpoint, '/v2/receipt');
    assert.equal(signed.tain_verification_uri, 'https://767-2676.com/v1/receipt/tain/'+EXPECTED.tain);
  });
  check('signed_digest_nonce_and_predecessor', () => {
    assert.equal(signed.commitment.payload_digest.algorithm, 'sha-256');
    assert.equal(signed.commitment.payload_digest.value, createHash('sha256').update(checkpoint).digest('base64url'));
    assert.equal(signed.commitment.nonce, EXPECTED.nonce);
    assert.equal(decode(signed.commitment.nonce, 'base64url').length, 32);
    assert.equal(signed.commitment.previous_attestation_digest, null);
  });
  check('signed_timestamp_and_interval_arithmetic', () => {
    assert.equal(signed.witnessed_at_utc, EXPECTED.witnessed);
    const received = utc(signed.request_received_at_utc), witnessed = utc(signed.witnessed_at_utc);
    const created = utc(signed.statement_created_at_utc), earliest = utc(signed.witness_window_utc.earliest);
    const latest = utc(signed.witness_window_utc.latest);
    assert.equal(signed.unix_time_milliseconds, witnessed);
    assert.equal(signed.clock_accuracy_radius_ms, 10000);
    assert.equal(earliest, witnessed-10000); assert.equal(latest, witnessed+10000);
    assert(received <= witnessed && witnessed <= created);
    assert.equal(signed.server_processing_duration_ms, witnessed-received);
    assert.equal(signed.post_witness_processing_duration_ms, created-witnessed);
  });
  check('signed_scope_does_not_grant_extra_proof', () => {
    const scope = signed.evidence_scope;
    assert.equal(scope.type, 'payload_commitment_witness');
    for (const field of ['caller_identity_proven','recipient_delivery_proven','action_execution_proven',
      'nonce_uniqueness_enforced','replay_prevented','authorization_granted',
      'external_atomic_clock_alignment_proven','clock_accuracy_independently_verified',
      'payer_authorization_bound_to_commitment']) assert.equal(scope[field], false);
  });
  check('retained_freetsa_files_match_sample_hashes_not_signature_verification', () => {
    assert.equal(packet.freetsa_timestamp_response.encoding, 'base64');
    tsr = decode(packet.freetsa_timestamp_response.bytes, 'base64');
    assert.equal(tsr.length, EXPECTED.tsrBytes);
    assert.equal(packet.freetsa_timestamp_response.byte_length, tsr.length);
    assert.equal(sha(tsr), EXPECTED.tsrSha256);
    assert.equal(packet.freetsa_timestamp_response.sha256_hex, EXPECTED.tsrSha256);
    assert.equal(sha(packet.freetsa_root_certificate_pem), EXPECTED.rootSha256);
    assert.equal(sha(packet.freetsa_signing_certificate_pem), EXPECTED.signerSha256);
  });
  check('deliberate_one_byte_change_breaks_binding_not_original_signature', () => {
    const changed = Buffer.from(checkpoint);
    changed[0] ^= 1;
    const alteredDigest = createHash('sha256').update(changed).digest('base64url');
    assert.notEqual(alteredDigest, signed.commitment.payload_digest.value);
    assert.equal(signatureValid(), true);
    demonstration = {byte_offset:0,operation:'XOR 1',original_byte:checkpoint[0],altered_byte:changed[0],
      altered_sha256_hex:sha(changed),altered_digest_matches_receipt:false,original_signature_still_valid:true};
  });
  const passed = checks.every(item => item.status === 'PASS');
  return {status:passed ? 'PASS' : 'FAIL', historical:true, sample_date:'2026-10-14',
    checks, ...(demonstration ? {one_byte_demonstration:demonstration} : {}),
    ...(passed ? {verified_sample:{checkpoint_bytes:checkpoint.length,checkpoint_sha256_hex:sha(checkpoint),
      receipt_id:receipt.receipt_id,witnessed_at_utc:receipt.witnessed_at_utc,
      issuer_asserted_interval:receipt.witness_window_utc,original_nonce_matches:true}} : {}),
    scope:{network_requests:0,payments:0,authorization_granted:false,
      key_trust:'Included public key matched this retained example; issuer trust was not established independently.',
      freetsa_rfc3161_signature_verified:false,
      independent_clock_accuracy_checked:false,revocation_checked:false,payment_settlement_checked:false,
      identity_proven:false,action_execution_proven:false,current_time_established:false},
    note:'The timestamp interval is internally consistent, not independently calibrated. FreeTSA files are retained unchanged for a separate native verifier. This checker is not a general production receipt validator.'};
}

export function verifyAndExtract(packet, outputDirectory) {
  const report = verifyPacket(packet);
  if (report.status !== 'PASS') return report;
  assert.equal(typeof outputDirectory, 'string');
  assert(outputDirectory.trim(), 'Supply a NEW output directory');
  const directory = path.resolve(outputDirectory);
  fs.mkdirSync(directory, {mode:0o700}); // Fails if any file, directory or symlink already occupies this path.
  const checkpoint = decode(packet.exact_checkpoint.bytes, 'base64url');
  const changed = Buffer.from(checkpoint); changed[0] ^= 1;
  const files = {'checkpoint.txt':checkpoint,'checkpoint-tampered.txt':changed,
    'checkpoint.tsr':decode(packet.freetsa_timestamp_response.bytes, 'base64'),
    'freetsa-root.pem':packet.freetsa_root_certificate_pem,'freetsa-signer.pem':packet.freetsa_signing_certificate_pem};
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory,name),content,{flag:'wx',mode:0o600});
  report.extracted_files = Object.entries(files).map(([name,content])=>({name,bytes:Buffer.byteLength(content),sha256:sha(content)}));
  fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 4, 'Usage: node verifier.mjs packet.json NEW-output-directory');
    assert(fs.statSync(process.argv[2]).size <= 1000000, 'Sample file exceeds 1 MB');
    const packet = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const report = verifyAndExtract(packet,process.argv[3]);
    console.log(JSON.stringify(report,null,2));
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({status:'FAIL',error:error.code || error.message,
      network_requests:0,payments:0,authorization_granted:false}));
    process.exitCode = 1;
  }
}
