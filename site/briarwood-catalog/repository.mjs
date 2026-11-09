import {validateCard, assertPublicUrl, sha256} from './card.mjs';

// Only the operator's fixed configuration can choose a repository or credential.
// Card content never supplies an API URL, branch, path, token, or commit message.
const API = 'https://api.github.com';
const MAX_DOCUMENT = 512 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;
const MAX_ENTRIES = 1000;
const MAX_ATTEMPTS = 3;
const utf8 = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const gitHash = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f\u2028\u2029]/.test(value);

export class RepositoryError extends Error {
  constructor(code, status = 502, retryable = false) {
    super(code);
    this.name = 'RepositoryError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
const fail = (code, status = 502, retryable = false) => { throw new RepositoryError(code, status, retryable); };
function exactKeys(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('invalid_pointer_ledger');
}
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function unbase64(content) {
  if (typeof content !== 'string') fail('invalid_repository_content');
  const compact = content.replace(/\n/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) fail('invalid_repository_content');
  const decoded = Uint8Array.from(atob(compact), character => character.charCodeAt(0));
  if (decoded.length > MAX_DOCUMENT) fail('pointer_ledger_too_large');
  if (base64(decoded) !== compact) fail('invalid_repository_content');
  return decoded;
}
async function blobHash(bytes) {
  const header = utf8.encode('blob ' + bytes.length + '\0');
  const joined = new Uint8Array(header.length + bytes.length);
  joined.set(header); joined.set(bytes, header.length);
  return hex(await crypto.subtle.digest('SHA-1', joined));
}
async function validateLedger(value) {
  exactKeys(value, ['schema', 'entries']);
  if (value.schema !== 'briarwood-pointers/1' || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) fail('invalid_pointer_ledger');
  const ids = new Set(), urls = new Set();
  for (const entry of value.entries) {
    exactKeys(entry, ['id', 'name', 'offer', 'card_url', 'card_sha256', 'listed_at', 'updated_at', 'active'], ['suspended']);
    if (!hash(entry.id) || !hash(entry.card_sha256) || !text(entry.name, 120) || !text(entry.offer, 600) || typeof entry.active !== 'boolean' || !timestamp(entry.listed_at) || !timestamp(entry.updated_at) || entry.updated_at < entry.listed_at || (Object.hasOwn(entry, 'suspended') && typeof entry.suspended !== 'boolean')) fail('invalid_pointer_ledger');
    try { if (assertPublicUrl(entry.card_url) !== entry.card_url) fail('invalid_pointer_ledger'); } catch { fail('invalid_pointer_ledger'); }
    if (entry.id !== await sha256(utf8.encode(entry.card_url)) || ids.has(entry.id) || urls.has(entry.card_url)) fail('invalid_pointer_ledger');
    ids.add(entry.id); urls.add(entry.card_url);
  }
  return value;
}

export function createRepository({owner, repo, branch = 'main', path = 'pointers.json', token, fetchImpl = fetch} = {}) {
  if (typeof owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) || typeof repo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repo)) fail('invalid_repository_configuration', 500);
  if (typeof branch !== 'string' || !branch.length || branch.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.') || branch.split('/').some(part => part.endsWith('.lock'))) fail('invalid_repository_configuration', 500);
  if (typeof path !== 'string' || path.length > 500 || !path.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && part !== '.' && part !== '..')) fail('invalid_repository_configuration', 500);
  if (token !== undefined && (typeof token !== 'string' || !/^[\x21-\x7e]{1,1024}$/.test(token))) fail('invalid_repository_configuration', 500);
  if (typeof fetchImpl !== 'function') fail('invalid_repository_configuration', 500);
  const repositoryPath = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
  const filePath = path.split('/').map(encodeURIComponent).join('/');
  const headers = {accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'briarwood-catalog/1'};
  if (token) headers.authorization = 'Bearer ' + token;

  async function request(suffix = '', method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(API + repositoryPath + suffix, {
        method, headers: {...headers, ...(body ? {'content-type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}),
        redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(10000)
      });
    } catch { fail('repository_transport_unavailable', 503, true); }
    if (response.status >= 300 && response.status < 400) fail('repository_redirect_refused');
    if (response.status === 409) fail('repository_conflict', 409, true);
    if (response.status === 401 || response.status === 403) fail('repository_permission_denied', 503);
    if (response.status === 404) fail('repository_or_initial_file_missing', 503);
    if (response.status === 422) fail('repository_write_rejected', 503);
    if (response.status === 429) fail('repository_rate_limited', 503, true);
    if (response.status !== 200 && !(method === 'PUT' && response.status === 201)) fail('repository_upstream_unavailable', 503, true);
    const length = response.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE)) fail('repository_response_too_large');
    if (!response.body) fail('invalid_repository_response');
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try {
      for (;;) {
        const {value, done} = await reader.read(); if (done) break;
        total += value.length;
        if (total > MAX_RESPONSE) { await reader.cancel(); fail('repository_response_too_large'); }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      fail('repository_transport_unavailable', 503, true);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { fail('invalid_repository_response'); }
  }

  async function publicRepository() {
    const metadata = await request();
    if (!object(metadata) || metadata.private !== false || typeof metadata.full_name !== 'string' || metadata.full_name.toLowerCase() !== (owner + '/' + repo).toLowerCase()) fail('public_repository_required', 503);
  }
  async function readAt(commit) {
    if (!gitHash(commit)) fail('invalid_repository_commit');
    const file = await request('/contents/' + filePath + '?ref=' + commit);
    if (!object(file) || file.type !== 'file' || file.path !== path || file.encoding !== 'base64' || !gitHash(file.sha) || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_DOCUMENT || file.submodule_git_url || file.target) fail('invalid_repository_content');
    const bytes = unbase64(file.content);
    if (bytes.length !== file.size || await blobHash(bytes) !== file.sha) fail('repository_blob_hash_mismatch');
    let ledger;
    try { ledger = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { fail('invalid_pointer_ledger'); }
    await validateLedger(ledger);
    return {ledger, commit, blob_sha: file.sha, document_sha256: await sha256(bytes), raw_url: 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + commit + '/' + filePath, commit_url: 'https://github.com/' + owner + '/' + repo + '/commit/' + commit};
  }
  async function read() {
    await publicRepository();
    const head = await request('/commits/' + encodeURIComponent(branch));
    if (!object(head) || !gitHash(head.sha)) fail('invalid_repository_commit');
    return readAt(head.sha);
  }
  async function publicationReadback(commit, intendedHash, entry, state) {
    let snapshot;
    try { snapshot = await readAt(commit); }
    catch (error) {
      if (error.code === 'repository_blob_hash_mismatch' || error.code === 'invalid_pointer_ledger') throw error;
      fail('publication_unconfirmed', 503, true);
    }
    if (snapshot.document_sha256 !== intendedHash) fail('publication_readback_mismatch');
    return {state, entry: snapshot.ledger.entries.find(item => item.id === entry.id), snapshot};
  }
  async function reconcile(intendedHash, entry, state) {
    let snapshot;
    try { snapshot = await read(); }
    catch { fail('publication_unconfirmed', 503, true); }
    // A failed PUT can have committed. Only the exact intended document at an
    // immutable, verified commit resolves this ambiguity; never blindly PUT again.
    if (snapshot.document_sha256 !== intendedHash) fail('publication_unconfirmed', 503, true);
    return {state, entry: snapshot.ledger.entries.find(item => item.id === entry.id), snapshot};
  }
  async function publish(observation) {
    if (!object(observation) || !hash(observation.sha256) || !Number.isInteger(observation.bytes) || observation.bytes < 1 || observation.bytes > 65536 || !timestamp(observation.fetched_at) || !object(observation.card)) fail('invalid_card_observation', 400);
    // Clone immediately: caller mutation during network awaits cannot change the
    // accepted metadata while retaining an earlier observed digest.
    const input = structuredClone(observation);
    let card;
    try { card = validateCard(input.card, input.card.card_url); }
    catch { fail('invalid_card_observation', 400); }
    if (!text(card.name, 120) || !text(card.offer, 600)) fail('invalid_card_observation', 400);
    const id = await sha256(utf8.encode(card.card_url));
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const snapshot = await read();
      const previous = snapshot.ledger.entries.find(entry => entry.id === id);
      if (previous?.suspended && card.listed) fail('witnessed_return_required', 409);
      if (!previous && !card.listed) return {state: 'withdrawn', entry: null, snapshot};
      if (previous?.card_sha256 === input.sha256 && previous.active === card.listed) {
        if (previous.name !== card.name || previous.offer !== card.offer) fail('card_digest_metadata_mismatch', 409);
        return {state: 'unchanged', entry: previous, snapshot};
      }
      if (previous && input.fetched_at < previous.updated_at) fail('stale_card_observation', 409, true);
      if (!token) fail('repository_write_credential_required', 503);
      if (!previous && snapshot.ledger.entries.length >= MAX_ENTRIES) fail('pointer_ledger_capacity_reached', 503);
      const when = previous && input.fetched_at < previous.updated_at ? previous.updated_at : input.fetched_at;
      const entry = {id, name: card.name, offer: card.offer, card_url: card.card_url, card_sha256: input.sha256, listed_at: previous?.listed_at ?? when, updated_at: when, active: card.listed, ...(previous && Object.hasOwn(previous, 'suspended') ? {suspended: previous.suspended} : {})};
      const ledger = {schema: 'briarwood-pointers/1', entries: previous ? snapshot.ledger.entries.map(item => item.id === id ? entry : item) : [...snapshot.ledger.entries, entry]};
      const bytes = utf8.encode(JSON.stringify(ledger, null, 2) + '\n');
      if (bytes.length > MAX_DOCUMENT) fail('pointer_ledger_capacity_reached', 503);
      const intendedHash = await sha256(bytes);
      const state = !card.listed ? 'withdrawn' : previous ? 'updated' : 'listed';
      let write;
      try {
        write = await request('/contents/' + filePath, 'PUT', {message: 'Briarwood ' + state + ' ' + input.sha256, content: base64(bytes), sha: snapshot.blob_sha, branch});
      } catch (error) {
        if (error.code === 'repository_conflict') { if (attempt + 1 < MAX_ATTEMPTS) continue; fail('repository_conflict_exhausted', 409, true); }
        if (['repository_permission_denied', 'repository_or_initial_file_missing', 'repository_write_rejected', 'repository_rate_limited', 'repository_redirect_refused'].includes(error.code)) throw error;
        return reconcile(intendedHash, entry, state);
      }
      if (!object(write) || !gitHash(write.commit?.sha)) return reconcile(intendedHash, entry, state);
      return publicationReadback(write.commit.sha, intendedHash, entry, state);
    }
    fail('repository_conflict_exhausted', 409, true);
  }
  return {read, publish};
}
