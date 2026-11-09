import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { verifyPacket, TRUSTED_KEY_THUMBPRINT, ORIGINAL_RECEIPT_SHA256 } from './verify.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest();
const packet = JSON.parse(await readFile(new URL('./packet.json', import.meta.url)));
const receiptBytes = await readFile(new URL('./receipt.json', import.meta.url));
const keys = JSON.parse(await readFile(new URL('./issuer-public-keys.json', import.meta.url)));
const clone = value => structuredClone(value);
const flipHex = hex => (hex[0] === '0' ? '1' : '0') + hex.slice(1);

// Advancing the explicitly trusted checksum lets a test reach the cryptographic
// checks. The CLI never takes either trust pin from the packet or user arguments.
function changedEnvelope(mutate) {
  const envelope = JSON.parse(receiptBytes);
  mutate(envelope);
  const bytes = Buffer.from(JSON.stringify(envelope));
  const changed = clone(packet);
  changed.receipt_sha256 = sha(bytes).toString('hex');
  return { packet: changed, bytes, trust: { trustedReceiptSha256: changed.receipt_sha256 } };
}

test('unchanged public example verifies one path and all 27 operations', () => {
  const result = verifyPacket(packet, receiptBytes, keys);
  assert.equal(result.verified, true);
  assert.equal(result.aggregate_paths_verified, 1);
  assert.equal(result.ots_operations_replayed, 27);
  assert.equal(result.issuer_key_thumbprint, TRUSTED_KEY_THUMBPRINT);
  assert.equal(packet.receipt_sha256, ORIGINAL_RECEIPT_SHA256);
  assert.equal(result.network_requests, 0);
});

test('changed aggregate commitment is rejected', () => {
  const changed = clone(packet);
  changed.aggregate_commitment_hex = flipHex(changed.aggregate_commitment_hex);
  assert.throws(() => verifyPacket(changed, receiptBytes, keys), /inclusion path/);
});

test('changed sibling argument is rejected', () => {
  const changed = clone(packet);
  const index = changed.operations.findIndex(op => op.startsWith('f0') || op.startsWith('f1'));
  assert.ok(index >= 0);
  const operation = changed.operations[index];
  changed.operations[index] = operation.slice(0, -2) + flipHex(operation.slice(-2));
  assert.throws(() => verifyPacket(changed, receiptBytes, keys), /inclusion path/);
});

test('changed claimed root is rejected', () => {
  const changed = clone(packet);
  changed.witnessed_root_hex = flipHex(changed.witnessed_root_hex);
  assert.throws(() => verifyPacket(changed, receiptBytes, keys), /inclusion path/);
});

test('changed exact receipt bytes are rejected', () => {
  assert.throws(() => verifyPacket(packet, Buffer.concat([receiptBytes, Buffer.from('\n')]), keys), /checksum mismatch/);
});

test('packet cannot replace the independent original receipt pin', () => {
  const changed = changedEnvelope(envelope => { envelope.payment_status = 'altered'; });
  assert.throws(() => verifyPacket(changed.packet, changed.bytes, keys), /trusted original/);
});

test('changed signature is rejected even after checksum is advanced', () => {
  const changed = changedEnvelope(envelope => {
    const parts = envelope.witness_attestation.compact_jws.split('.');
    const signature = Buffer.from(parts[2], 'base64url');
    signature[0] ^= 1;
    parts[2] = signature.toString('base64url');
    envelope.witness_attestation.compact_jws = parts.join('.');
  });
  assert.throws(() => verifyPacket(changed.packet, changed.bytes, keys, changed.trust), /Invalid witness signature/);
});

test('changed signed payload is rejected even after checksum is advanced', () => {
  const changed = changedEnvelope(envelope => {
    const parts = envelope.witness_attestation.compact_jws.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
    payload.commitment.nonce = 'changed';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    envelope.witness_attestation.compact_jws = parts.join('.');
    envelope.witness_receipt = payload;
  });
  assert.throws(() => verifyPacket(changed.packet, changed.bytes, keys, changed.trust), /Invalid witness signature/);
});

test('unsigned envelope cannot contradict the signed receipt', () => {
  const changed = changedEnvelope(envelope => { envelope.witness_receipt.commitment.nonce = 'changed'; });
  assert.throws(() => verifyPacket(changed.packet, changed.bytes, keys, changed.trust), /Envelope differs/);
});

test('noncanonical JWS encoding is rejected', () => {
  const changed = changedEnvelope(envelope => {
    const parts = envelope.witness_attestation.compact_jws.split('.');
    parts[0] += '=';
    envelope.witness_attestation.compact_jws = parts.join('.');
  });
  assert.throws(() => verifyPacket(changed.packet, changed.bytes, keys, changed.trust), /base64url/);
});

test('a substituted public key and substituted packet pin do not establish trust', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const key = pair.publicKey.export({ format: 'jwk' });
  key.kid = packet.expected.key_id;
  const changed = clone(packet);
  changed.expected_key_thumbprint = sha(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y })).toString('base64url');
  assert.throws(() => verifyPacket(changed, receiptBytes, { keys: [key] }), /Untrusted packet key pin/);
  assert.throws(() => verifyPacket(packet, receiptBytes, { keys: [key] }), /trusted pin/);
});

test('duplicate matching public keys are rejected', () => {
  const changed = clone(keys);
  changed.keys.push(clone(changed.keys.find(key => key.kid === packet.expected.key_id)));
  assert.throws(() => verifyPacket(packet, receiptBytes, changed), /exactly one/);
});

for (const [name, operation, pattern] of [
  ['unsupported opcode', '09', /Unsupported OTS operation/],
  ['hash trailing bytes', '0800', /trailing bytes/],
  ['truncated varint', 'f080', /argument length/],
  ['noncanonical varint', 'f0810000', /Noncanonical/],
  ['zero length', 'f000', /outside bounds/],
  ['missing argument bytes', 'f00200', /length mismatch/],
  ['oversized argument', 'f08120', /outside bounds/],
]) {
  test(`malformed OTS operation rejected: ${name}`, () => {
    const changed = clone(packet);
    changed.operations = [operation];
    assert.throws(() => verifyPacket(changed, receiptBytes, keys), pattern);
  });
}

test('an excessively long OTS path is rejected', () => {
  const changed = clone(packet);
  changed.operations = Array(257).fill('08');
  assert.throws(() => verifyPacket(changed, receiptBytes, keys), /path length outside bounds/);
});

// A fresh in-memory fixture signer proves that root/nonce/node/protocol checks
// still reject an otherwise valid signature. No production private key is used.
function signedFixture(mutateReceipt = () => {}, mutatePacket = () => {}, mutateHeader = () => {}) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const key = pair.publicKey.export({ format: 'jwk' });
  key.kid = packet.expected.key_id;
  const thumbprint = sha(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y })).toString('base64url');
  const changed = clone(packet);
  const receipt = clone(JSON.parse(receiptBytes).witness_receipt);
  mutateReceipt(receipt);
  mutatePacket(changed);
  const header = { alg: 'ES256', kid: key.kid, typ: 'popcorn-witness+jws' };
  mutateHeader(header);
  const signingInput = Buffer.from(`${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(receipt)).toString('base64url')}`);
  const signature = sign('sha256', signingInput, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  assert.ok(verify('sha256', signingInput, { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, signature), 'Fixture must have a valid independent signature');
  const bytes = Buffer.from(JSON.stringify({
    witness_receipt: receipt,
    witness_attestation: { compact_jws: `${signingInput.toString()}.${signature.toString('base64url')}` },
  }));
  changed.receipt_sha256 = sha(bytes).toString('hex');
  changed.expected_key_thumbprint = thumbprint;
  return {
    packet: changed, bytes, keys: { keys: [key] },
    trust: { trustedKeyThumbprint: thumbprint, trustedReceiptSha256: changed.receipt_sha256 },
  };
}

test('explicitly trusted fixture with correct binding passes', () => {
  const fixture = signedFixture();
  assert.equal(verifyPacket(fixture.packet, fixture.bytes, fixture.keys, fixture.trust).verified, true);
});

test('valid signature over wrong payload digest is rejected', () => {
  const fixture = signedFixture(receipt => { receipt.commitment.payload_digest.value = sha(Buffer.from('different root')).toString('base64url'); });
  assert.throws(() => verifyPacket(fixture.packet, fixture.bytes, fixture.keys, fixture.trust), /does not bind the witnessed root/);
});

test('hashing root hex text instead of raw root bytes is rejected', () => {
  const fixture = signedFixture(receipt => { receipt.commitment.payload_digest.value = sha(Buffer.from(packet.witnessed_root_hex, 'utf8')).toString('base64url'); });
  assert.throws(() => verifyPacket(fixture.packet, fixture.bytes, fixture.keys, fixture.trust), /does not bind the witnessed root/);
});

test('valid signature over wrong nonce is rejected', () => {
  const fixture = signedFixture(receipt => { receipt.commitment.nonce = 'different-nonce'; });
  assert.throws(() => verifyPacket(fixture.packet, fixture.bytes, fixture.keys, fixture.trust), /Unexpected receipt nonce/);
});

test('packet and valid signature cannot substitute another protocol', () => {
  const fixture = signedFixture(receipt => { receipt.protocol_id = 'other'; }, changed => { changed.expected.protocol_id = 'other'; });
  assert.throws(() => verifyPacket(fixture.packet, fixture.bytes, fixture.keys, fixture.trust), /Wrong receipt protocol/);
});

test('packet and valid signature cannot substitute another node', () => {
  const fixture = signedFixture(receipt => { receipt.node_id = 'other.example'; }, changed => { changed.expected.node_id = 'other.example'; });
  assert.throws(() => verifyPacket(fixture.packet, fixture.bytes, fixture.keys, fixture.trust), /Wrong issuing node/);
});

test('unexpected JWS algorithm is rejected despite valid ES256 signature bytes', () => {
  const fixture = signedFixture(undefined, undefined, header => { header.alg = 'HS256'; });
  assert.throws(() => verifyPacket(fixture.packet, fixture.bytes, fixture.keys, fixture.trust), /Wrong JWS algorithm/);
});

test('a packet cannot redirect the fixed companion filenames', () => {
  const changed = clone(packet);
  changed.receipt_file = '../../other.json';
  assert.throws(() => verifyPacket(changed, receiptBytes, keys), /Unexpected receipt filename/);
});
