export const PROTOCOL = 'BRIARWOOD-INQUIRY/2';
export function fail(code) { throw Object.assign(new Error(code), { code }); }
export function assert(value, code) { if (!value) fail(code); }
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const id = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(x);
export const hash = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
export const text = (x, max = 2048) => typeof x === 'string' && x.trim().length > 0 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
export function shape(x, required, optional = []) {
  assert(object(x) && required.every(k => Object.hasOwn(x, k)) &&
    Object.keys(x).every(k => required.includes(k) || optional.includes(k)), 'invalid_shape');
}
export function time(x) {
  assert(typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x), 'invalid_time');
  const n = Date.parse(x);
  assert(Number.isFinite(n) && new Date(n).toISOString().slice(0, 19) === x.slice(0, 19), 'invalid_time');
  return n;
}
export function interval(x) {
  assert(object(x), 'time_unavailable');
  const lower = time(x.lower), upper = time(x.upper);
  assert(lower <= upper, 'invalid_time_interval');
  return { lower, upper };
}
export function live(p, now) {
  const from = time(p.issued_at), until = time(p.expires_at);
  assert(from <= now.lower && now.upper < until && from < until, 'expired_or_uncertain');
}
export function endpoint(url, participant, trust) {
  publicHttpsEndpoint(url);
  let parsed;
  try { parsed = new URL(url); } catch { fail('invalid_endpoint'); }
  assert(typeof url === 'string' && parsed.protocol === 'https:' && !parsed.username &&
    !parsed.password && !parsed.hash && Object.hasOwn(trust, participant) &&
    Array.isArray(trust[participant].endpoints) && trust[participant].endpoints.includes(url), 'endpoint_not_pinned');
  return url;
}
import { publicHttpsEndpoint } from './discovery.mjs';
