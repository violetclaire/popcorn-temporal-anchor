import { isIP } from 'node:net';
import { canonical, digest, ProtocolError, verifyEnvelope } from './crypto.mjs';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fail = (code, message) => { throw new ProtocolError(code, message); };

function record(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      required.some(key => !own(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('invalid_listing_fields');
}

function text(value, maximum = 512) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail('invalid_listing_string');
  return value;
}

function strings(value, maximum = 32, itemLength = 512, allowEmpty = true) {
  if (!Array.isArray(value) || value.length > maximum || (!allowEmpty && value.length === 0)) fail('invalid_listing_array');
  value.forEach(item => text(item, itemLength));
  if (new Set(value).size !== value.length) fail('duplicate_listing_value');
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail('invalid_date');
  const timestamp = Date.parse(value);
  const normalized = value.includes('.') ? value.slice(0, 20) + value.slice(20, -1).padEnd(3, '0') + 'Z' : value.replace('Z', '.000Z');
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== normalized) fail('invalid_date');
  return timestamp;
}

function clock(value) {
  if (value instanceof Date) value = value.getTime();
  if (typeof value === 'number' && Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime())) return value;
  if (typeof value === 'string') return instant(value);
  fail('invalid_as_of', 'An explicit valid asOf time is required');
}

export function publicHttpsEndpoint(value) {
  text(value, 2048);
  let url;
  try { url = new URL(value); } catch { fail('invalid_endpoint'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href !== value) fail('invalid_endpoint');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || !hostname.includes('.') && !hostname.includes(':')) fail('private_endpoint');
  if (isIP(hostname) === 4) {
    const [a, b] = hostname.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
        a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)) fail('private_endpoint');
  }
  if (isIP(hostname) === 6) {
    // IPv4-mapped and transition literals are rejected instead of being implicitly trusted.
    if (hostname.startsWith('::') || /^(fc|fd|fe[89ab]|ff)/.test(hostname) || hostname.startsWith('64:ff9b:') || hostname.startsWith('2002:')) fail('private_endpoint');
  }
  return value;
}

/** Validate a signed provider listing against independently provisioned local trust. */
export function validateListing(envelope, { trust, asOf } = {}) {
  const now = clock(asOf);
  const listing = verifyEnvelope(envelope, trust);
  record(listing, ['protocol', 'type', 'issuer', 'listing_id', 'issued_at', 'expires_at', 'subject', 'capabilities', 'conditions', 'inquiry_endpoint', 'terms', 'response_within_ms']);
  if (listing.protocol !== 'BRIARWOOD-LISTING/1' || listing.type !== 'listing') fail('invalid_listing_protocol');
  text(listing.listing_id, 160);
  text(listing.subject, 512);
  strings(listing.capabilities, 64, 128, false);
  strings(listing.conditions, 64);
  const issued = instant(listing.issued_at);
  const expires = instant(listing.expires_at);
  if (expires <= issued) fail('invalid_listing_window');
  if (issued > now) fail('listing_not_yet_valid');
  if (expires <= now) fail('listing_expired');
  if (!Number.isSafeInteger(listing.response_within_ms) || listing.response_within_ms <= 0 || listing.response_within_ms > 2_592_000_000) fail('invalid_response_window');
  publicHttpsEndpoint(listing.inquiry_endpoint);
  const participant = Object.getOwnPropertyDescriptor(trust, listing.issuer)?.value;
  const endpoints = participant && Object.getOwnPropertyDescriptor(participant, 'endpoints')?.value;
  if (!Array.isArray(endpoints) || !endpoints.includes(listing.inquiry_endpoint)) fail('untrusted_endpoint');
  record(listing.terms, ['version', 'summary', 'price', 'constraints']);
  text(listing.terms.version, 128);
  text(listing.terms.summary, 4096);
  strings(listing.terms.constraints, 64);
  record(listing.terms.price, ['amount_atomic', 'currency', 'network', 'payee']);
  if (typeof listing.terms.price.amount_atomic !== 'string' || !/^(0|[1-9][0-9]{0,29})$/.test(listing.terms.price.amount_atomic)) fail('invalid_price_amount');
  text(listing.terms.price.currency, 32);
  text(listing.terms.price.network, 128);
  text(listing.terms.price.payee, 256);
  return listing;
}

/** Search only supplied candidate listings; this function performs no network calls or inquiries. */
export function searchProviders(listings, query, options = {}) {
  clock(options.asOf);
  // Canonicalization also excludes accessors, sparse arrays, undefined, and non-JSON objects.
  let cleanQuery;
  try { cleanQuery = JSON.parse(canonical(query)); } catch { fail('invalid_search_query'); }
  try {
    record(cleanQuery, ['capabilities'], ['text']);
    strings(cleanQuery.capabilities, 64, 128);
    if (own(cleanQuery, 'text')) text(cleanQuery.text, 512);
  } catch { fail('invalid_search_query'); }
  if (!Array.isArray(listings) || listings.length > 1000) fail('invalid_candidate_list');
  const words = cleanQuery.text?.toLowerCase().split(/\s+/) ?? [];
  const matches = [];
  const rejected = [];
  for (let index = 0; index < listings.length; index++) {
    try {
      const listing = validateListing(listings[index], options);
      const haystack = [listing.subject, ...listing.capabilities, ...listing.conditions].join(' ').toLowerCase();
      if (!cleanQuery.capabilities.every(capability => listing.capabilities.includes(capability)) || !words.every(word => haystack.includes(word))) continue;
      matches.push({ listing: { payload: listing, jws: listings[index].jws }, terms_digest: digest(listing.terms) });
    } catch (error) {
      rejected.push({ index, reason: error instanceof ProtocolError ? error.code : 'invalid_candidate' });
    }
  }
  matches.sort((left, right) => {
    const a = canonical([left.listing.payload.issuer, left.listing.payload.listing_id, left.terms_digest, left.listing.jws]);
    const b = canonical([right.listing.payload.issuer, right.listing.payload.listing_id, right.terms_digest, right.listing.jws]);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return { matches, rejected };
}
