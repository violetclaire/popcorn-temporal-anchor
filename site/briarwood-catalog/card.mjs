/** Member-owned cards. This module never calls a declared service/contact endpoint. */
const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 8000;
const CATALOG = 'https://briarwood.ai/catalog';
const RESERVED = new Set(['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'test', 'example', 'invalid', 'onion', 'alt', 'arpa']);

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function fail(field, message) {
  throw new HttpError(400, 'CARD_FIELD_INVALID', `${field}: ${message}`);
}

/** Public-hostname check only. This is not DNS resolution or DNS pinning. */
export function assertPublicUrl(value, field = 'url', { allowQuery = false } = {}) {
  const bad = () => { throw new HttpError(400, 'CARD_URL_INVALID', `${field}: use a public HTTPS hostname without credentials, fragments, or a non-443 port.`); };
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\u0000-\u0020\u007f\\]/u.test(value)) bad();
  let url;
  try { url = new URL(value); } catch { bad(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || value.includes('#') || (!allowQuery && value.includes('?'))) bad();
  const host = url.hostname.toLowerCase();
  const labels = host.split('.');
  // WHATWG URL normalizes alternative IPv4 forms (integer, hex, octal) before this check.
  if (host.includes(':') || /^[0-9.]+$/.test(host) || host.length > 253 || labels.length < 2 ||
      labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      RESERVED.has(labels.at(-1)) || ['example.com', 'example.net', 'example.org'].some(x => host === x || host.endsWith(`.${x}`))) bad();
  return url.href;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(field, 'must be an object');
}

function string(value, field, max = MAX_BYTES, singleLine = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(field, `must be a nonempty string of at most ${max} characters`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) ||
      (singleLine && /[\r\n\t\u2028\u2029]/u.test(value))) fail(field, 'must contain readable text on the allowed number of lines');
}

function key(value) {
  object(value, 'member_key');
  if (value.algorithm !== 'Ed25519') fail('member_key.algorithm', 'must be Ed25519');
  if (typeof value.public_key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.public_key)) fail('member_key.public_key', 'must be an unpadded base64url 32-byte public key');
  const decoded = atob(value.public_key.replaceAll('-', '+').replaceAll('_', '/') + '=');
  const encoded = btoa(decoded).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (decoded.length !== 32 || encoded !== value.public_key) fail('member_key.public_key', 'must be canonical base64url for 32 bytes');
}

/** Validate declarations, not identity, availability, authorization, or service functionality. */
export function validateCard(value, expectedUrl) {
  object(value, 'card');
  if (value.schema !== 'briarwood-card/1') fail('schema', 'must be briarwood-card/1');
  if (value.catalog !== CATALOG) fail('catalog', `must explicitly opt in to ${CATALOG}`);
  if (typeof value.listed !== 'boolean') fail('listed', 'must explicitly be true or false');
  string(value.name, 'name', 120, true);
  string(value.offer, 'offer', 600, true);
  const address = assertPublicUrl(value.card_url, 'card_url');
  if (address !== value.card_url) fail('card_url', 'must be the exact canonical HTTPS address');
  if (address !== assertPublicUrl(expectedUrl, 'submitted card_url')) fail('card_url', 'must match the submitted address');
  object(value.terms, 'terms');
  for (const field of ['scope', 'time', 'cost', 'consequences', 'decision']) string(value.terms[field], `terms.${field}`, 2000);
  object(value.witness, 'witness');
  assertPublicUrl(value.witness.verification_url, 'witness.verification_url', { allowQuery: true });
  if (!Array.isArray(value.witness.trusted_keys)) fail('witness.trusted_keys', 'must be an array of public key identifiers or HTTPS key URLs');
  value.witness.trusted_keys.forEach((entry, index) => {
    string(entry, `witness.trusted_keys[${index}]`, MAX_BYTES, true);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(entry) || /^https?:/i.test(entry)) assertPublicUrl(entry, `witness.trusted_keys[${index}]`, { allowQuery: true });
  });
  if (!value.witness.trusted_keys.length) string(value.witness.limitations, 'witness.limitations');
  if (value.member_key !== undefined) key(value.member_key);
  if (value.representative_queries !== undefined) {
    if (!Array.isArray(value.representative_queries) || value.representative_queries.length > 10) fail('representative_queries', 'must be an array of at most 10 strings');
    value.representative_queries.forEach((entry, index) => string(entry, `representative_queries[${index}]`));
  }
  if (value.contact === undefined && value.service === undefined) fail('contact or service', 'provide at least one actionable next step');
  if (value.contact !== undefined) {
    object(value.contact, 'contact');
    assertPublicUrl(value.contact.url, 'contact.url', { allowQuery: true });
    string(value.contact.instructions, 'contact.instructions');
  }
  if (value.service !== undefined) {
    object(value.service, 'service');
    if (!['streamable-http', 'https', 'stdio'].includes(value.service.transport)) fail('service.transport', 'must be streamable-http, https, or stdio');
    if (value.service.transport === 'stdio') string(value.service.package, 'service.package');
    if (value.service.transport !== 'stdio' || value.service.endpoint !== undefined) assertPublicUrl(value.service.endpoint, 'service.endpoint', { allowQuery: true });
    string(value.service.instructions, 'service.instructions');
    string(value.service.authentication, 'service.authentication');
  }
  return structuredClone(value);
}

export async function sha256(bytes) {
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) throw new TypeError('sha256 expects bytes');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function ipv4(address) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return null;
  const parts = address.split('.').map(Number);
  return parts.every(n => n <= 255) ? parts : null;
}

function ipv6(address) {
  if (!/^[0-9a-f:]+$/i.test(address) || !address.includes(':')) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (![...left, ...right].every(x => /^[0-9a-f]{1,4}$/i.test(x))) return null;
  if (halves.length === 1 && left.length !== 8) return null;
  if (halves.length === 2 && left.length + right.length >= 8) return null;
  return [...left, ...Array(8 - left.length - right.length).fill('0'), ...right].map(x => parseInt(x, 16));
}

function publicAddress(address) {
  if (typeof address !== 'string') return false;
  const v4 = ipv4(address);
  if (v4) {
    const [a, b, c] = v4;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) || (a === 203 && b === 0 && c === 113));
  }
  const v6 = ipv6(address);
  // Accept ordinary global unicast only, excluding special/documentation/tunnel ranges.
  return !!v6 && v6[0] >= 0x2000 && v6[0] <= 0x3fff &&
    !(v6[0] === 0x2001 && (v6[1] < 0x0200 || v6[1] === 0x0db8)) &&
    v6[0] !== 0x2002 && !(v6[0] === 0x3fff && v6[1] < 0x1000);
}

function cancel(reader) {
  try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* cancellation cannot extend the deadline */ }
}

async function readBytes(response, signal) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new HttpError(502, 'CARD_LENGTH_INVALID', 'Card response has an invalid content length.');
  if (length !== null && Number(length) > MAX_BYTES) throw new HttpError(413, 'CARD_TOO_LARGE', 'Card response exceeds 64 KiB.');
  if (!response.body) throw new HttpError(502, 'CARD_BODY_EMPTY', 'Card response has no JSON body.');
  const reader = response.body.getReader();
  const abort = () => cancel(reader);
  signal.addEventListener('abort', abort, { once: true });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new HttpError(504, 'CARD_TIMEOUT', 'Card fetch exceeded the 8 second limit.');
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new HttpError(502, 'CARD_BODY_INVALID', 'Card response body is not bytes.');
      size += value.byteLength;
      if (size > MAX_BYTES) throw new HttpError(413, 'CARD_TOO_LARGE', 'Card response exceeds 64 KiB.');
      chunks.push(value.slice());
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } catch (error) {
    cancel(reader);
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    try { reader.releaseLock(); } catch { /* a broken reader must not hide the original failure */ }
  }
}

/**
 * Hash exact response payload bytes; `bytes` in the result is their count.
 * resolvePublic(hostname), when supplied, returns IP strings or {address,family} answers.
 * DNS preflight is not pinned to fetch: production must also use platform egress protection.
 */
export async function fetchCard(value, { fetchImpl = fetch, now = () => new Date(), resolvePublic } = {}) {
  const url = assertPublicUrl(value, 'card_url');
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new HttpError(504, 'CARD_TIMEOUT', 'Card fetch exceeded the 8 second limit.'));
      controller.abort();
    }, TIMEOUT_MS);
  });
  const work = async () => {
    if (resolvePublic !== undefined) {
      if (typeof resolvePublic !== 'function') throw new HttpError(500, 'CARD_DNS_CONFIG', 'The DNS resolver is not configured correctly.');
      let answers;
      try { answers = await resolvePublic(new URL(url).hostname); }
      catch { throw new HttpError(502, 'CARD_DNS_FAILED', 'The card hostname could not be checked.'); }
      if (!Array.isArray(answers) || !answers.length || answers.some(answer => !publicAddress(typeof answer === 'string' ? answer : answer?.address))) {
        throw new HttpError(400, 'CARD_URL_NOT_PUBLIC', 'The card hostname must resolve only to public addresses.');
      }
    }
    if (controller.signal.aborted) throw new HttpError(504, 'CARD_TIMEOUT', 'Card fetch exceeded the 8 second limit.');
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer', headers: { Accept: 'application/json, application/*+json' }, signal: controller.signal,
    });
    if (!response || !Number.isInteger(response.status) || !response.headers?.get) throw new HttpError(502, 'CARD_RESPONSE_INVALID', 'The card host returned an invalid response.');
    if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== url) {
      try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* best effort */ }
      throw new HttpError(400, 'CARD_REDIRECT', 'Card redirects are not accepted; publish and submit the card at its own exact address.');
    }
    if (response.status !== 200) throw new HttpError(502, 'CARD_HTTP_ERROR', `The card host returned HTTP ${response.status}.`);
    const type = response.headers.get('content-type')?.split(';').map(x => x.trim());
    if (!type || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/i.test(type[0]) ||
        type.slice(1).some(x => /^charset\s*=/i.test(x) && !/^charset\s*=\s*"?utf-?8"?$/i.test(x))) {
      throw new HttpError(415, 'CARD_CONTENT_TYPE', 'Card response must be application/json or an application/*+json type encoded as UTF-8.');
    }
    const bytes = await readBytes(response, controller.signal);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new HttpError(400, 'CARD_UTF8_INVALID', 'Card response must contain valid UTF-8 bytes.'); }
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new HttpError(400, 'CARD_JSON_INVALID', 'Card response must be a JSON document.'); }
    const card = validateCard(parsed, url);
    const digest = await sha256(bytes);
    return { card, sha256: digest, bytes: bytes.byteLength, fetched_at: now().toISOString() };
  };
  try { return await Promise.race([work(), deadline]); }
  catch (error) {
    if (error instanceof HttpError) throw error;
    if (controller.signal.aborted) throw new HttpError(504, 'CARD_TIMEOUT', 'Card fetch exceeded the 8 second limit.');
    throw new HttpError(502, 'CARD_FETCH_FAILED', 'The card could not be fetched and checked.');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
