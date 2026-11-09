// Offline verifier for one saved OpenTimestamps aggregate path and its POPCORN receipt.
// No dependencies, network requests, payment calls, or filesystem writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRUSTED_KEY_THUMBPRINT = 'ns4g75U5Bsn2bA3XtaSuQhDg065PVkhYgs3KOtJVPf0';
export const ORIGINAL_RECEIPT_SHA256 = 'e07058b1b008e1033b5ca53dde5cc2bf291ea8139d3907baab383b7e03b677f6';
const sha256 = bytes => createHash('sha256').update(bytes).digest();

function hexBytes(value, length, label) {
  assert.equal(typeof value, 'string', `${label}: expected a hex string`);
  assert.match(value, /^[0-9a-f]+$/, `${label}: expected lowercase hex`);
  assert.equal(value.length, length * 2, `${label}: wrong byte length`);
  return Buffer.from(value, 'hex');
}

function base64url(value, label, maxBytes = 65536) {
  assert.equal(typeof value, 'string', `${label}: expected a string`);
  assert.ok(value.length <= Math.ceil(maxBytes * 4 / 3), `${label}: too large`);
  assert.match(value, /^[A-Za-z0-9_-]+$/, `${label}: invalid base64url`);
  const bytes = Buffer.from(value, 'base64url');
  assert.equal(bytes.toString('base64url'), value, `${label}: noncanonical base64url`);
  assert.ok(bytes.length <= maxBytes, `${label}: too large`);
  return bytes;
}

function applyOperation(value, encoded) {
  assert.equal(typeof encoded, 'string', 'Operation must be serialized hex');
  assert.ok(encoded.length <= 8200, 'Operation too large');
  assert.match(encoded, /^(?:[0-9a-f]{2})+$/, 'Invalid operation hex');
  const bytes = Buffer.from(encoded, 'hex');
  if (bytes[0] === 0x08) {
    assert.equal(bytes.length, 1, 'SHA-256 operation has trailing bytes');
    return sha256(value);
  }
  assert.ok(bytes[0] === 0xf0 || bytes[0] === 0xf1, 'Unsupported OTS operation');
  let length = 0;
  let cursor = 1;
  let shift = 0;
  while (true) {
    assert.ok(cursor < bytes.length && shift <= 14, 'Invalid operation argument length');
    const octet = bytes[cursor++];
    length += (octet & 0x7f) * 2 ** shift;
    if (!(octet & 0x80)) {
      assert.ok(cursor === 2 || octet !== 0, 'Noncanonical operation argument length');
      break;
    }
    shift += 7;
  }
  assert.ok(length > 0 && length <= 4096, 'Operation argument outside bounds');
  assert.equal(cursor + length, bytes.length, 'Operation argument length mismatch');
  assert.ok(value.length + length <= 4096, 'OTS intermediate value too large');
  const argument = bytes.subarray(cursor);
  return bytes[0] === 0xf0
    ? Buffer.concat([value, argument])
    : Buffer.concat([argument, value]);
}

/**
 * Verify the fixed public example. A caller may explicitly supply other trusted
 * pins for controlled fixtures; neither pin is ever accepted from packet data.
 * This function reads no files and performs no network operations.
 */
export function verifyPacket(packet, receiptBytes, keys, {
  trustedKeyThumbprint = TRUSTED_KEY_THUMBPRINT,
  trustedReceiptSha256 = ORIGINAL_RECEIPT_SHA256,
} = {}) {
  assert.equal(packet.format, 'popcorn-ots-aggregate-example/v1', 'Unknown packet format');
  assert.equal(packet.receipt_file, 'receipt.json', 'Unexpected receipt filename');
  assert.equal(packet.public_keys_file, 'issuer-public-keys.json', 'Unexpected keys filename');
  assert.equal(packet.expected_key_thumbprint, trustedKeyThumbprint, 'Untrusted packet key pin');
  assert.ok(Buffer.isBuffer(receiptBytes), 'Receipt must be supplied as exact bytes');
  assert.ok(receiptBytes.length <= 1048576, 'Receipt too large');
  hexBytes(packet.receipt_sha256, 32, 'Receipt checksum');
  assert.equal(sha256(receiptBytes).toString('hex'), packet.receipt_sha256, 'Receipt checksum mismatch');
  assert.equal(packet.receipt_sha256, trustedReceiptSha256, 'Receipt differs from the trusted original');

  const root = hexBytes(packet.witnessed_root_hex, 32, 'Witnessed root');
  let value = hexBytes(packet.aggregate_commitment_hex, 44, 'Aggregate commitment');
  assert.ok(Array.isArray(packet.operations), 'Missing OTS operations');
  assert.ok(packet.operations.length > 0 && packet.operations.length <= 256, 'OTS path length outside bounds');
  for (const operation of packet.operations) value = applyOperation(value, operation);
  assert.ok(value.equals(root), 'OTS inclusion path does not reach the witnessed root');

  const envelope = JSON.parse(receiptBytes.toString('utf8'));
  const compact = envelope.witness_attestation?.compact_jws;
  assert.equal(typeof compact, 'string', 'Missing compact JWS');
  const parts = compact.split('.');
  assert.equal(parts.length, 3, 'Invalid compact JWS');
  const header = JSON.parse(base64url(parts[0], 'JWS header', 4096).toString('utf8'));
  assert.deepEqual(Object.keys(header).sort(), ['alg', 'kid', 'typ'], 'Unsupported JWS header fields');
  assert.equal(header.alg, 'ES256', 'Wrong JWS algorithm');
  assert.equal(header.typ, 'popcorn-witness+jws', 'Wrong JWS type');
  assert.equal(header.kid, 'popcorn-witness-2026-01', 'Wrong witness key identifier');
  assert.equal(header.kid, packet.expected.key_id, 'Unexpected witness key identifier');
  const payload = base64url(parts[1], 'JWS payload');
  const signature = base64url(parts[2], 'JWS signature', 64);
  assert.equal(signature.length, 64, 'Invalid ES256 signature length');

  assert.ok(Array.isArray(keys.keys), 'Expected a JSON Web Key Set');
  const matches = keys.keys.filter(key => key.kid === header.kid);
  assert.equal(matches.length, 1, 'Expected exactly one matching public key');
  const key = matches[0];
  assert.equal(key.kty, 'EC', 'Wrong key type');
  assert.equal(key.crv, 'P-256', 'Wrong key curve');
  assert.ok(!Object.hasOwn(key, 'd'), 'Only public keys are accepted');
  assert.equal(base64url(key.x, 'Public key x', 32).length, 32, 'Wrong public key x length');
  assert.equal(base64url(key.y, 'Public key y', 32).length, 32, 'Wrong public key y length');
  // RFC 7638 requires these four public members, lexicographically ordered.
  const thumbprint = sha256(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y })).toString('base64url');
  assert.equal(thumbprint, trustedKeyThumbprint, 'Public key does not match the trusted pin');
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii');
  assert.ok(verify('sha256', signingInput, {
    key: createPublicKey({ key, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  }, signature), 'Invalid witness signature');

  const receipt = JSON.parse(payload.toString('utf8'));
  assert.deepEqual(envelope.witness_receipt, receipt, 'Envelope differs from the signed receipt');
  assert.equal(receipt.protocol_id, 'POPCORN-WITNESS/2.0', 'Wrong receipt protocol');
  assert.equal(receipt.node_id, '767-2676.com', 'Wrong issuing node');
  for (const field of ['receipt_id', 'protocol_id', 'node_id', 'witnessed_at_utc', 'tain']) {
    assert.equal(receipt[field], packet.expected[field], `Unexpected receipt ${field}`);
  }
  assert.equal(receipt.commitment.payload_digest.algorithm, 'sha-256', 'Wrong commitment algorithm');
  assert.equal(receipt.commitment.payload_digest.value, sha256(root).toString('base64url'), 'Receipt does not bind the witnessed root');
  assert.equal(receipt.commitment.nonce, packet.expected.nonce, 'Unexpected receipt nonce');
  assert.equal(receipt.commitment.previous_attestation_digest, null, 'Unexpected previous attestation');
  assert.equal(receipt.evidence_scope.caller_identity_proven, false, 'Unexpected identity claim');
  assert.equal(receipt.evidence_scope.action_execution_proven, false, 'Unexpected execution claim');
  assert.equal(receipt.evidence_scope.authorization_granted, false, 'Unexpected authorization claim');

  return {
    verified: true,
    aggregate_paths_verified: 1,
    ots_operations_replayed: packet.operations.length,
    witnessed_root_hex: root.toString('hex'),
    receipt_id: receipt.receipt_id,
    tain: receipt.tain,
    witnessed_at_utc: receipt.witnessed_at_utc,
    witness_window_utc: receipt.witness_window_utc,
    issuer_key_thumbprint: thumbprint,
    network_requests: 0,
    scope: 'One aggregate inclusion path reaches the root bound by this signed witness receipt. This does not identify original files, establish authorization or execution, independently verify the witness clock, or verify a Bitcoin timestamp.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2, 'Usage: node verify.mjs (reads fixed companion files)');
    const directory = dirname(fileURLToPath(import.meta.url));
    const [packetBytes, receiptBytes, keysBytes] = await Promise.all([
      readFile(resolve(directory, 'packet.json')),
      readFile(resolve(directory, 'receipt.json')),
      readFile(resolve(directory, 'issuer-public-keys.json')),
    ]);
    const result = verifyPacket(JSON.parse(packetBytes), receiptBytes, JSON.parse(keysBytes));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
