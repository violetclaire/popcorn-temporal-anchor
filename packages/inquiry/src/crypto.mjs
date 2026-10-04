import { createHash, createPrivateKey, createPublicKey, KeyObject, sign, verify } from 'node:crypto';

export class ProtocolError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

const MAX_BYTES = 1_048_576;
const MAX_SIGNED_BYTES = 65_536;
const MAX_DEPTH = 32;
const MAX_NODES = 10_000;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = (code, message) => { throw new ProtocolError(code, message); };

function validUnicode(value) {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** Canonical JSON: sorted UTF-16 object keys and ECMAScript JSON numbers/strings. */
export function canonical(value) {
  let nodes = 0;
  const ancestors = new Set();
  function encode(item, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('json_limit', 'JSON exceeds the depth or node limit');
    if (item === null) return 'null';
    if (typeof item === 'boolean') return String(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Math.abs(item) > Number.MAX_SAFE_INTEGER) fail('invalid_json_number');
      return JSON.stringify(item);
    }
    if (typeof item === 'string') {
      if (item.length > MAX_BYTES || !validUnicode(item)) fail('invalid_json_string');
      return JSON.stringify(item);
    }
    if (typeof item !== 'object') fail('invalid_json_value');
    if (ancestors.has(item)) fail('invalid_json_cycle');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) fail('invalid_json_object');
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) {
      if (item.length > MAX_NODES) fail('json_limit');
      const names = Reflect.ownKeys(item);
      if (names.length !== item.length + 1) fail('invalid_json_array');
      const values = [];
      for (let index = 0; index < item.length; index++) {
        const property = Object.getOwnPropertyDescriptor(item, String(index));
        if (!property || !property.enumerable || !own(property, 'value')) fail('invalid_json_array');
        values.push(encode(property.value, depth + 1));
      }
      result = '[' + values.join(',') + ']';
    } else {
      const keys = Reflect.ownKeys(item);
      if (keys.some(key => typeof key !== 'string' || !validUnicode(key))) fail('invalid_json_key');
      result = '{' + keys.sort().map(key => {
        const property = Object.getOwnPropertyDescriptor(item, key);
        if (!property.enumerable || !own(property, 'value')) fail('invalid_json_property');
        return encode(key, depth + 1) + ':' + encode(property.value, depth + 1);
      }).join(',') + '}';
    }
    ancestors.delete(item);
    if (Buffer.byteLength(result, 'utf8') > MAX_BYTES) fail('json_limit', 'Canonical JSON exceeds 1 MiB');
    return result;
  }
  const result = encode(value, 0);
  if (Buffer.byteLength(result, 'utf8') > MAX_BYTES) fail('json_limit', 'Canonical JSON exceeds 1 MiB');
  return result;
}

export function digest(value) {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function identifier(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)) fail('invalid_' + label);
  return value;
}

function exactObject(value, fields, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || fields.some(key => !own(value, key))) fail(code);
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property.enumerable || !own(property, 'value')) fail(code);
  }
}

function ownValue(object, key, code) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) fail(code);
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const property = Object.getOwnPropertyDescriptor(object, key);
  if (!property || !own(property, 'value')) fail(code);
  return property.value;
}

function decode(segment, code) {
  if (typeof segment !== 'string' || !/^[A-Za-z0-9_-]+$/.test(segment)) fail(code);
  const result = Buffer.from(segment, 'base64url');
  if (result.toString('base64url') !== segment) fail(code);
  return result;
}

function parseCanonicalJson(segment, code) {
  const bytes = decode(segment, code);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail(code); }
  if (!bytes.equals(Buffer.from(canonical(value), 'utf8'))) fail(code);
  return value;
}

/** Participant signatures are distinct from independent POPCORN time witnesses. */
export function signEnvelope(payload, identity) {
  const payloadText = canonical(payload);
  if (Buffer.byteLength(payloadText, 'utf8') > MAX_SIGNED_BYTES) fail('signed_payload_limit');
  const cloned = JSON.parse(payloadText);
  if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) fail('invalid_payload');
  const issuer = identifier(cloned.issuer, 'issuer');
  if (!identity || identifier(identity.id, 'identity') !== issuer) fail('issuer_identity_mismatch');
  const kid = identifier(identity.kid, 'key_id');
  let privateKey;
  try {
    privateKey = identity.privateKey instanceof KeyObject ? identity.privateKey :
      identity.privateKey && typeof identity.privateKey === 'object' && own(identity.privateKey, 'kty') ?
        createPrivateKey({ key: identity.privateKey, format: 'jwk' }) : createPrivateKey(identity.privateKey);
  } catch { fail('invalid_signing_key'); }
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') fail('invalid_signing_key');
  const header = Buffer.from(canonical({ alg: 'EdDSA', kid, typ: 'BRIARWOOD-JWS/1' })).toString('base64url');
  const body = Buffer.from(payloadText, 'utf8').toString('base64url');
  const signingInput = `${header}.${body}`;
  const signature = sign(null, Buffer.from(signingInput, 'ascii'), privateKey).toString('base64url');
  return { payload: cloned, jws: `${signingInput}.${signature}` };
}

/** Verify against operator-pinned issuer/key entries; never fetch or trust envelope-supplied keys. */
export function verifyEnvelope(envelope, trust) {
  exactObject(envelope, ['payload', 'jws'], 'invalid_envelope');
  const payloadText = canonical(envelope.payload);
  if (Buffer.byteLength(payloadText, 'utf8') > MAX_SIGNED_BYTES) fail('signed_payload_limit');
  const payload = JSON.parse(payloadText);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('invalid_payload');
  const issuer = identifier(payload.issuer, 'issuer');
  if (typeof envelope.jws !== 'string' || envelope.jws.length > 100_000) fail('invalid_jws');
  const segments = envelope.jws.split('.');
  if (segments.length !== 3) fail('invalid_jws');
  const [protectedHeader, encodedPayload, encodedSignature] = segments;
  const header = parseCanonicalJson(protectedHeader, 'invalid_jws_header');
  exactObject(header, ['alg', 'kid', 'typ'], 'invalid_jws_header');
  if (header.alg !== 'EdDSA' || header.typ !== 'BRIARWOOD-JWS/1') fail('invalid_jws_header');
  const kid = identifier(header.kid, 'key_id');
  if (!decode(encodedPayload, 'invalid_jws_payload').equals(Buffer.from(payloadText, 'utf8'))) fail('payload_mismatch');
  const signature = decode(encodedSignature, 'invalid_jws_signature');
  if (signature.length !== 64) fail('invalid_jws_signature');
  const participant = ownValue(trust, issuer, 'untrusted_issuer');
  const keys = ownValue(participant, 'keys', 'untrusted_key');
  const pinnedJwk = ownValue(keys, kid, 'untrusted_key');
  let jwk;
  try { jwk = JSON.parse(canonical(pinnedJwk)); } catch { fail('invalid_trusted_key'); }
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || own(jwk, 'd') ||
      (own(jwk, 'kid') && jwk.kid !== kid) || (own(jwk, 'alg') && jwk.alg !== 'EdDSA') ||
      (own(jwk, 'use') && jwk.use !== 'sig') ||
      (own(jwk, 'key_ops') && (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== 'verify'))) fail('invalid_trusted_key');
  if (decode(jwk.x, 'invalid_trusted_key').length !== 32) fail('invalid_trusted_key');
  let publicKey;
  try { publicKey = createPublicKey({ key: jwk, format: 'jwk' }); } catch { fail('invalid_trusted_key'); }
  if (!verify(null, Buffer.from(`${protectedHeader}.${encodedPayload}`, 'ascii'), publicKey, signature)) fail('invalid_signature');
  return payload;
}
