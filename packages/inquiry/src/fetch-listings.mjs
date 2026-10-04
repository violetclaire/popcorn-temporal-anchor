import { canonical, digest, ProtocolError } from './crypto.mjs';
import { publicHttpsEndpoint, searchProviders, validateListing } from './discovery.mjs';

const MAX_SOURCES = 20;
const MAX_BODY_BYTES = 65_536;
const MAX_TIMEOUT_MS = 10_000;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fail = code => { throw new ProtocolError(code); };

function sourceConfig(value, trust) {
  let source;
  try { source = JSON.parse(canonical(value)); } catch { fail('invalid_source'); }
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      Object.keys(source).length !== 2 || !own(source, 'issuer') || !own(source, 'url') ||
      typeof source.issuer !== 'string' || source.issuer.length > 160 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(source.issuer)) fail('invalid_source');
  publicHttpsEndpoint(source.url);
  if (!own(trust, source.issuer)) fail('untrusted_source_issuer');
  const participant = trust[source.issuer];
  if (!participant || typeof participant !== 'object' || Array.isArray(participant) ||
      !own(participant, 'endpoints') || !Array.isArray(participant.endpoints) ||
      !participant.endpoints.includes(source.url)) fail('untrusted_source_endpoint');
  return source;
}

function reasonFor(error) {
  return error instanceof ProtocolError ? error.code : 'source_fetch_failed';
}

async function retrieve(source, { trust, asOf, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let reader;
  let response;
  let timer;
  let timedOut = false;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ProtocolError('source_timeout'));
      // Cancellation is best effort: a faulty injected transport must not block the deadline.
      if (reader) void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  const task = async () => {
    try {
      response = await fetchImpl(source.url, {
        method: 'GET', headers: { accept: 'application/json' }, redirect: 'error',
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
    } catch { fail(controller.signal.aborted ? 'source_timeout' : 'source_fetch_failed'); }
    if (controller.signal.aborted) {
      // A custom transport may finish after the deadline despite ignoring its signal.
      if (response?.body && typeof response.body.cancel === 'function') void response.body.cancel().catch(() => {});
      fail('source_timeout');
    }
    if (!response || !Number.isInteger(response.status) || !response.headers || typeof response.headers.get !== 'function') fail('invalid_source_response');
    if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== source.url) fail('source_redirect');
    if (response.status !== 200) fail(`source_http_${response.status}`);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json' && !/^application\/[a-z0-9.+-]+\+json$/.test(contentType ?? '')) fail('source_content_type');
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) fail('source_body_limit');
    if (!response.body || typeof response.body.getReader !== 'function') fail('source_body_unreadable');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      if (controller.signal.aborted) fail('source_timeout');
      let next;
      try { next = await reader.read(); } catch { fail(controller.signal.aborted ? 'source_timeout' : 'source_body_unreadable'); }
      if (controller.signal.aborted) fail('source_timeout');
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) fail('source_body_unreadable');
      size += next.value.byteLength;
      if (size > MAX_BODY_BYTES) fail('source_body_limit');
      // Copy each chunk: a custom transport must not mutate already measured bytes.
      chunks.push(Buffer.from(next.value));
    }
    let envelope;
    try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))); }
    catch { fail('source_invalid_json'); }
    const listing = validateListing(envelope, { trust, asOf });
    if (listing.issuer !== source.issuer) fail('source_issuer_mismatch');
    return { envelope: { payload: listing, jws: envelope.jws }, http_status: response.status };
  };
  try {
    return await Promise.race([task(), deadline]);
  } catch (error) {
    throw new ProtocolError(timedOut ? 'source_timeout' : reasonFor(error));
  } finally {
    clearTimeout(timer);
    // Cancel on every early failure, including HTTP errors and declared oversize bodies.
    if (reader) {
      void reader.cancel().catch(() => {});
    } else if (response?.body && typeof response.body.cancel === 'function') {
      void response.body.cancel().catch(() => {});
    }
  }
}

/**
 * Explicitly retrieve signed listings from operator-installed, issuer-bound HTTPS sources.
 * No redirects, retries, payments, or inquiries are performed. Requests run sequentially.
 * URL checks reject private literals; the transport/network egress policy must separately
 * block private DNS resolutions and rebinding. This is not a complete SSRF defense.
 */
export async function discoverProviders(sources, query, {
  trust, asOf, fetchImpl = globalThis.fetch, timeoutMs = MAX_TIMEOUT_MS,
} = {}) {
  // Complete query validation before issuing any request, and snapshot caller-owned inputs.
  searchProviders([], query, { trust, asOf });
  const cleanQuery = JSON.parse(canonical(query));
  const checkedAsOf = asOf instanceof Date ? asOf.getTime() : asOf;
  if (!Array.isArray(sources) || sources.length > MAX_SOURCES) fail('invalid_source_list');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) fail('invalid_source_timeout');
  if (typeof fetchImpl !== 'function') fail('invalid_fetch_transport');
  let cleanTrust;
  try { cleanTrust = JSON.parse(canonical(trust)); } catch { fail('invalid_trust'); }
  if (!cleanTrust || typeof cleanTrust !== 'object' || Array.isArray(cleanTrust)) fail('invalid_trust');
  const prepared = [];
  const rejected = [];
  const retrievals = [];
  for (let index = 0; index < sources.length; index++) {
    try { prepared.push({ index, source: sourceConfig(sources[index], cleanTrust) }); }
    catch (error) {
      const reason = reasonFor(error);
      rejected.push({ index, reason });
      retrievals.push({ index, state: 'rejected', reason });
    }
  }
  const envelopes = [];
  const envelopeSources = [];
  const seen = new Set();
  for (const { index, source } of prepared) {
    try {
      const { envelope, http_status } = await retrieve(source, { trust: cleanTrust, asOf: checkedAsOf, fetchImpl, timeoutMs });
      const commitment = digest(envelope);
      if (seen.has(commitment)) {
        retrievals.push({ index, state: 'duplicate', http_status });
        continue;
      }
      seen.add(commitment);
      envelopes.push(envelope);
      envelopeSources.push(index);
      retrievals.push({ index, state: 'retrieved', http_status });
    } catch (error) {
      const reason = reasonFor(error);
      rejected.push({ index, reason });
      retrievals.push({ index, state: 'rejected', reason });
    }
  }
  const searched = searchProviders(envelopes, cleanQuery, { trust: cleanTrust, asOf: checkedAsOf });
  for (const item of searched.rejected) rejected.push({ index: envelopeSources[item.index], reason: item.reason });
  rejected.sort((a, b) => a.index - b.index);
  retrievals.sort((a, b) => a.index - b.index);
  return { matches: searched.matches, rejected, retrievals };
}
