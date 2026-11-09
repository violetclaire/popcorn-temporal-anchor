// Checkpoint-specific model. This does not import or deploy the wedding scheduler.
export function fail(code) { throw Object.assign(new Error(code), {code}); }
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail('non_json_value');
    return '[' + value.map(canonical).join(',') + ']';
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  fail('non_json_value');
}
export const utf8 = value => new TextEncoder().encode(value);
export function encode64(bytes) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decode64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) fail('noncanonical_base64url');
  let bytes;
  try { bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
  catch { fail('noncanonical_base64url'); }
  if (encode64(bytes) !== value) fail('noncanonical_base64url');
  return bytes;
}
export const digestBytes = async bytes => encode64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
export const digest = async value => digestBytes(utf8(canonical(value)));
export const authorizationDigest = async envelope => ({algorithm: 'sha-256', value: await digest(envelope)});
export const freshNonce = () => encode64(crypto.getRandomValues(new Uint8Array(32)));
export const exactKeys = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export function isDigest(value) {
  if (!exactKeys(value, ['algorithm', 'value']) || value.algorithm !== 'sha-256') return false;
  try { return decode64(value.value).byteLength === 32; } catch { return false; }
}
export const isId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
export function publicKey(value) {
  if (!exactKeys(value, ['kty','crv','x','y']) || value.kty !== 'EC' || value.crv !== 'P-256' || decode64(value.x).length !== 32 || decode64(value.y).length !== 32) fail('public_key_invalid');
  return value;
}
export async function verifySigned(envelope, publicJwk, expectedTyp) {
  if (!exactKeys(envelope, ['key_uri','compact_jws']) || typeof envelope.key_uri !== 'string' || typeof envelope.compact_jws !== 'string' || envelope.compact_jws.length > 32768) fail('signed_envelope_invalid');
  const parts = envelope.compact_jws.split('.');
  if (parts.length !== 3) fail('jws_invalid');
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const headerText = decoder.decode(decode64(parts[0]));
  const payloadText = decoder.decode(decode64(parts[1]));
  const header = JSON.parse(headerText), payload = JSON.parse(payloadText);
  if (!exactKeys(header, ['alg','typ']) || header.alg !== 'ES256' || header.typ !== expectedTyp || canonical(header) !== headerText || canonical(payload) !== payloadText) fail('jws_header_or_canonical_bytes_invalid');
  const signature = decode64(parts[2]);
  if (signature.length !== 64) fail('signature_invalid');
  const key = await crypto.subtle.importKey('jwk', publicKey(publicJwk), {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
  if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, key, signature, utf8(parts[0] + '.' + parts[1]))) fail('signature_invalid');
  return payload;
}
export async function createSigner({privateJwk, publicJwk, keyUri, typ}) {
  if (!privateJwk?.d || typeof keyUri !== 'string' || !keyUri.startsWith('https://') || typeof typ !== 'string' || !typ) fail('signer_configuration_incomplete');
  publicKey(publicJwk);
  const key = await crypto.subtle.importKey('jwk', privateJwk, {name:'ECDSA',namedCurve:'P-256'}, false, ['sign']);
  return {
    keyUri,publicJwk:JSON.parse(canonical(publicJwk)),
    async sign(payload) {
      const input = encode64(utf8(canonical({alg:'ES256',typ}))) + '.' + encode64(utf8(canonical(payload)));
      const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, key, utf8(input)));
      const envelope = {key_uri:keyUri,compact_jws:input + '.' + encode64(signature)};
      await verifySigned(envelope, publicJwk, typ);
      return envelope;
    }
  };
}
export function parseAction(actionBytes) {
  const bytes = decode64(actionBytes);
  if (bytes.length > 16384) fail('action_too_large');
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  const value = JSON.parse(text);
  if (canonical(value) !== text) fail('action_bytes_not_canonical');
  return value;
}
export function validate(action) {
  const issues = [];
  const missing = name => issues.push({code:'incomplete',message:'incomplete, need ' + name});
  const invalid = name => issues.push({code:'invalid',message:name});
  if (!action || typeof action !== 'object' || Array.isArray(action)) return {valid:false,issues:[{code:'incomplete',message:'incomplete, need proposed action'}]};
  const required = ['type','action_id','action_kind','checkpoint_digest','parameters','assignments'];
  for (const key of required) if (!Object.hasOwn(action,key)) missing(key);
  if (Object.keys(action).some(key => !required.includes(key))) invalid('undeclared action field');
  if (action.type !== 'checkpoint-action/v1') invalid('action type');
  if (!isId(action.action_id)) invalid('action ID');
  if (action.action_kind !== 'record_checkpoint') invalid('action kind');
  if (!isDigest(action.checkpoint_digest)) invalid('checkpoint digest');
  const params = new Map();
  if (!Array.isArray(action.parameters)) missing('parameters');
  else for (const entry of action.parameters) {
    if (!exactKeys(entry, ['id','value']) || !isId(entry.id) || params.has(entry.id)) { invalid('parameter declaration'); continue; }
    params.set(entry.id,entry.value);
  }
  for (const name of ['scope','clock','cost','evidence']) if (!params.has(name)) missing(name);
  for (const name of params.keys()) if (!['scope','clock','cost','evidence'].includes(name)) invalid('unsupported parameter ' + name);
  if (params.has('scope') && params.get('scope') !== 'popcorn-checkpoint-demo') invalid('scope');
  const clock = params.get('clock');
  if (clock && (!exactKeys(clock, ['accept_issuer_asserted','requires_measured_accuracy','max_radius_ms']) || typeof clock.accept_issuer_asserted !== 'boolean' || typeof clock.requires_measured_accuracy !== 'boolean' || !Number.isSafeInteger(clock.max_radius_ms) || clock.max_radius_ms < 0 || clock.max_radius_ms > 60000)) invalid('clock policy');
  else if (params.has('clock') && !clock) invalid('clock policy');
  const cost = params.get('cost');
  if (cost && (!exactKeys(cost, ['amount_atomic','asset','network','payee']) || cost.amount_atomic !== '2000' || cost.network !== 'eip155:8453' || cost.asset !== '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' || cost.payee !== '0x5f5a631e975183d084f60d7121e967b30ec83cb8')) invalid('cost: two witnesses require explicit 2000 USDC atomic units on Base to the configured payee');
  else if (params.has('cost') && !cost) invalid('cost');
  const evidence = params.get('evidence');
  if (params.has('evidence') && (!Array.isArray(evidence) || !evidence.length || evidence.some(x => typeof x !== 'string' || !x.trim() || x.length > 2048))) invalid('evidence references');
  if (!Array.isArray(action.assignments) || action.assignments.length !== 1) missing('one checkpoint assignment');
  else for (const row of action.assignments) {
    if (!exactKeys(row, ['id','parameterRefs']) || !isId(row.id) || !Array.isArray(row.parameterRefs) || row.parameterRefs.length !== 4 || new Set(row.parameterRefs).size !== 4 || row.parameterRefs.some(ref => !params.has(ref))) invalid('assignment must reference scope, clock, cost and evidence');
  }
  return {valid:issues.length===0,issues,parameters:action.parameters,assignments:action.assignments,price_basis:cost,evidence};
}
