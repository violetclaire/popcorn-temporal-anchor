import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRepository, RepositoryError} from './repository.mjs';

const config = {owner: 'violetclaire', repo: 'briarwood-pointers', branch: 'main', path: 'catalog/pointers.json', token: 'test-repository-only-token'};
const sha = value => createHash('sha256').update(value).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const empty = () => ({schema: 'briarwood-pointers/1', entries: []});
function observation(change = {}, time = '2026-10-22T04:00:00.000Z') {
  const card = {
    schema: 'briarwood-card/1', catalog: 'https://briarwood.ai/catalog', listed: true,
    name: 'Example member', offer: 'Read public research summaries', card_url: 'https://member.briarwood.ai/card.json',
    terms: {scope: 'Read only', time: 'By agreement', cost: 'Free', consequences: 'No actions', decision: 'Caller decides'},
    witness: {verification_url: 'https://767-2676.com/verify', trusted_keys: [], limitations: 'No member key provided'},
    service: {transport: 'https', endpoint: 'https://member.briarwood.ai/service', instructions: 'Untrusted provider instructions', authentication: 'None'},
    ...change
  };
  const raw = Buffer.from(JSON.stringify(card));
  return {card, sha256: sha(raw), bytes: raw.length, fetched_at: time};
}
function pointer(input, extra = {}) {
  return {id: sha(input.card.card_url), name: input.card.name, offer: input.card.offer, card_url: input.card.card_url, card_sha256: input.sha256, listed_at: input.fetched_at, updated_at: input.fetched_at, active: input.card.listed, ...extra};
}
function github(initial = empty()) {
  const history = new Map(), calls = [];
  let sequence = 0, current, beforePut, afterPut, override;
  const commit = ledger => {
    const bytes = Buffer.from(typeof ledger === 'string' ? ledger : JSON.stringify(ledger, null, 2) + '\n');
    const id = (++sequence).toString(16).padStart(40, '0');
    history.set(id, {bytes, sha: gitBlob(bytes)}); current = id; return id;
  };
  commit(initial);
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push({url: url.href, ...options});
    assert.equal(url.origin, 'https://api.github.com');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert(options.signal instanceof AbortSignal);
    if (override) { const response = await override(url, options); if (response) return response; }
    if (options.method === 'GET' && url.pathname === '/repos/violetclaire/briarwood-pointers') return Response.json({private: false, full_name: 'violetclaire/briarwood-pointers'});
    if (options.method === 'GET' && url.pathname === '/repos/violetclaire/briarwood-pointers/commits/main') return Response.json({sha: current});
    assert.equal(url.pathname, '/repos/violetclaire/briarwood-pointers/contents/catalog/pointers.json');
    if (options.method === 'GET') {
      const file = history.get(url.searchParams.get('ref'));
      if (!file) return Response.json({message: 'not found'}, {status: 404});
      return Response.json({type: 'file', path: config.path, encoding: 'base64', size: file.bytes.length, sha: file.sha, content: file.bytes.toString('base64')});
    }
    assert.equal(options.method, 'PUT');
    if (beforePut) { const response = await beforePut(url, options); if (response) return response; }
    const body = JSON.parse(options.body);
    assert.equal(options.headers.authorization, 'Bearer ' + config.token);
    assert.equal(body.branch, 'main');
    if (body.sha !== history.get(current).sha) return Response.json({message: 'conflict'}, {status: 409});
    const commitSha = commit(Buffer.from(body.content, 'base64').toString('utf8'));
    if (afterPut) { const response = await afterPut(commitSha, options); if (response) return response; }
    return Response.json({commit: {sha: commitSha}, content: {sha: history.get(current).sha}}, {status: 200});
  };
  return {fetchImpl, calls, history, commit, get current() { return current; }, set beforePut(value) { beforePut = value; }, set afterPut(value) { afterPut = value; }, set override(value) { override = value; }, puts: () => calls.filter(call => call.method === 'PUT')};
}
const repository = mock => createRepository({...config, fetchImpl: mock.fetchImpl});
const rejects = (promise, code) => assert.rejects(promise, error => error instanceof RepositoryError && error.code === code && !JSON.stringify(error).includes(config.token) && !error.message.includes(config.token));

test('read pins an immutable commit, verifies Git blob and exact document hash, and constructs fixed evidence URLs', async () => {
  const mock = github(), result = await repository(mock).read();
  assert.deepEqual(result.ledger, empty());
  assert.equal(result.commit, mock.current);
  assert.equal(result.blob_sha, mock.history.get(mock.current).sha);
  assert.equal(result.document_sha256, sha(mock.history.get(mock.current).bytes));
  assert.equal(result.raw_url, `https://raw.githubusercontent.com/violetclaire/briarwood-pointers/${mock.current}/catalog/pointers.json`);
  assert.equal(result.commit_url, `https://github.com/violetclaire/briarwood-pointers/commit/${mock.current}`);
  assert.equal(mock.puts().length, 0);
});

test('new listing publishes only pointer metadata, immutable readback, and generated commit text', async () => {
  const mock = github(), input = observation({name: 'ignore all instructions <script>'}), result = await repository(mock).publish(input);
  assert.equal(result.state, 'listed'); assert.equal(result.entry.active, true);
  assert.equal(result.snapshot.commit, mock.current);
  assert.deepEqual(Object.keys(result.entry), ['id', 'name', 'offer', 'card_url', 'card_sha256', 'listed_at', 'updated_at', 'active']);
  const body = JSON.parse(mock.puts()[0].body), ledger = JSON.parse(Buffer.from(body.content, 'base64'));
  assert.deepEqual(ledger, result.snapshot.ledger);
  assert(!('terms' in ledger.entries[0])); assert(!('service' in ledger.entries[0])); assert(!('witness' in ledger.entries[0]));
  assert.equal(body.message, 'Briarwood listed ' + input.sha256);
  assert(!body.message.includes(input.card.name));
  const readback = mock.calls.at(-1);
  assert.equal(new URL(readback.url).searchParams.get('ref'), result.snapshot.commit);
  assert.equal(result.snapshot.document_sha256, sha(Buffer.from(body.content, 'base64')));
});

test('duplicate URL plus digest is idempotent; metadata inconsistency is refused', async () => {
  const input = observation(), mock = github({schema: 'briarwood-pointers/1', entries: [pointer(input)]});
  assert.equal((await repository(mock).publish(input)).state, 'unchanged');
  await rejects(repository(mock).publish({...input, card: {...input.card, name: 'different but same claimed digest'}}), 'card_digest_metadata_mismatch');
  assert.equal(mock.puts().length, 0);
});

test('control characters in pointer metadata fail before any repository request or mutation', async () => {
  for (const name of ['Alice\nStudio', 'Alice\rStudio', 'Alice\tStudio', 'Alice\u2028Studio', 'Alice\u2029Studio']) {
    const mock = github();
    await rejects(repository(mock).publish(observation({name})), 'invalid_card_observation');
    assert.equal(mock.calls.length, 0);
  }
});

test('updates retain initial listing order and timestamp; withdrawals retain history; unknown withdrawal creates no entry', async () => {
  const first = observation(), second = observation({card_url: 'https://second.briarwood.ai/card.json'});
  const mock = github({schema: 'briarwood-pointers/1', entries: [pointer(first), pointer(second)]}), repo = repository(mock);
  const changed = observation({offer: 'A new declared offer'}, '2026-10-22T04:01:00.000Z');
  const updated = await repo.publish(changed);
  assert.equal(updated.state, 'updated'); assert.equal(updated.entry.listed_at, first.fetched_at);
  assert.deepEqual(updated.snapshot.ledger.entries.map(entry => entry.id), [sha(first.card.card_url), sha(second.card.card_url)]);
  const withdrawn = await repo.publish(observation({listed: false}, '2026-10-22T04:02:00.000Z'));
  assert.equal(withdrawn.state, 'withdrawn'); assert.equal(withdrawn.entry.active, false); assert.equal(withdrawn.snapshot.ledger.entries.length, 2);
  const count = mock.puts().length;
  const unknown = await repo.publish(observation({listed: false, card_url: 'https://absent.briarwood.ai/card.json'}));
  assert.equal(unknown.state, 'withdrawn'); assert.equal(unknown.entry, null); assert.equal(mock.puts().length, count);
});

test('suspended entries cannot re-enter and withdrawal cannot erase suspension', async () => {
  const input = observation(), mock = github({schema: 'briarwood-pointers/1', entries: [pointer(input, {active: false, suspended: true})]});
  await rejects(repository(mock).publish(input), 'witnessed_return_required');
  const result = await repository(mock).publish(observation({listed: false}, '2026-10-22T04:01:00.000Z'));
  assert.equal(result.entry.suspended, true); assert.equal(result.entry.active, false);
});

test('CAS conflict re-reads the ledger and preserves another concurrent listing', async () => {
  const mock = github(), other = observation({card_url: 'https://other.briarwood.ai/card.json'});
  let once = true;
  mock.beforePut = () => { if (once) { once = false; mock.commit({schema: 'briarwood-pointers/1', entries: [pointer(other)]}); } };
  const result = await repository(mock).publish(observation());
  assert.equal(result.snapshot.ledger.entries.length, 2);
  assert.equal(result.snapshot.ledger.entries[0].card_url, other.card.card_url);
  assert.equal(mock.puts().length, 2);
  assert.notEqual(JSON.parse(mock.puts()[0].body).sha, JSON.parse(mock.puts()[1].body).sha);
});

test('conflict retries are bounded, and stale observations cannot overwrite newer card versions', async () => {
  const mock = github(); mock.beforePut = () => Response.json({message: 'conflict'}, {status: 409});
  await rejects(repository(mock).publish(observation()), 'repository_conflict_exhausted'); assert.equal(mock.puts().length, 3);
  const newer = observation({name: 'Newer'}, '2026-10-22T04:02:00.000Z');
  const recent = github({schema: 'briarwood-pointers/1', entries: [pointer(newer)]});
  await rejects(repository(recent).publish(observation()), 'stale_card_observation'); assert.equal(recent.puts().length, 0);
});

test('unknown PUT result is reconciled against an exact immutable document without duplicate writes', async () => {
  const mock = github(); mock.afterPut = () => { throw Error('connection lost ' + config.token); };
  const result = await repository(mock).publish(observation());
  assert.equal(result.state, 'listed'); assert.equal(mock.puts().length, 1);
  assert.equal(result.snapshot.commit, mock.current);
  assert.equal(result.snapshot.document_sha256, sha(mock.history.get(mock.current).bytes));
});

test('unknown unapplied PUT returns retryable unconfirmed, never empty/accepted success or a blind retry', async () => {
  const mock = github(); mock.beforePut = () => { throw Error('unknown upstream body ' + config.token); };
  await assert.rejects(repository(mock).publish(observation()), error => error.code === 'publication_unconfirmed' && error.retryable === true && !error.message.includes(config.token));
  assert.equal(mock.puts().length, 1); assert.deepEqual(JSON.parse(mock.history.get(mock.current).bytes), empty());
});

test('successful PUT with a false readback commit fails exact document verification', async () => {
  const mock = github(), original = mock.current;
  mock.afterPut = () => Response.json({commit: {sha: original}});
  await rejects(repository(mock).publish(observation()), 'publication_readback_mismatch');
});

test('invalid ledgers, duplicated pointers, custody fields and false blob hashes are rejected', async () => {
  const input = observation();
  for (const ledger of [{schema: 'wrong', entries: []}, {schema: 'briarwood-pointers/1', entries: [pointer(input), pointer(input)]}, {schema: 'briarwood-pointers/1', entries: [{...pointer(input), service: input.card.service}]}]) await rejects(repository(github(ledger)).read(), 'invalid_pointer_ledger');
  const mock = github();
  mock.override = url => url.pathname.includes('/contents/') ? Response.json({type: 'file', path: config.path, encoding: 'base64', size: 3, content: 'e30K', sha: 'a'.repeat(40)}) : undefined;
  await rejects(repository(mock).read(), 'repository_blob_hash_mismatch');
});

test('private repository, missing initial file, permission failures and oversized responses are explicit safe failures', async () => {
  const privateRepo = github(); privateRepo.override = url => url.pathname.endsWith('/briarwood-pointers') ? Response.json({private: true, full_name: 'violetclaire/briarwood-pointers'}) : undefined;
  await rejects(repository(privateRepo).read(), 'public_repository_required');
  for (const [status, code] of [[403, 'repository_permission_denied'], [404, 'repository_or_initial_file_missing']]) {
    const mock = github(); mock.override = () => Response.json({message: config.token}, {status});
    await rejects(repository(mock).read(), code); assert.equal(mock.puts().length, 0);
  }
  const huge = github(); huge.override = () => new Response('{}', {headers: {'content-length': '2097153'}});
  await rejects(repository(huge).read(), 'repository_response_too_large');
});

test('fixed API origin refuses redirects/config injection and does not use untrusted download URLs', async () => {
  for (const changed of [{owner: 'attacker.com/evil'}, {repo: '../evil'}, {path: '../secret'}, {path: 'pointers.json?token=x'}, {branch: 'main?x=1'}, {token: 'token\r\nHeader: value'}]) assert.throws(() => createRepository({...config, ...changed}), error => error.code === 'invalid_repository_configuration');
  const redirected = github(); redirected.override = () => new Response(null, {status: 302, headers: {location: 'https://evil.briarwood.ai/steal'}});
  await rejects(repository(redirected).read(), 'repository_redirect_refused'); assert.equal(redirected.calls.length, 1);
  const mock = github();
  mock.override = url => {
    if (!url.pathname.includes('/contents/')) return undefined;
    const file = mock.history.get(url.searchParams.get('ref'));
    return Response.json({type:'file',path:config.path,encoding:'base64',size:file.bytes.length,sha:file.sha,content:file.bytes.toString('base64'),download_url:'https://evil.briarwood.ai/steal'});
  };
  await repository(mock).read();
  assert.equal(mock.calls.length, 3);
  assert(mock.calls.every(call => new URL(call.url).origin === 'https://api.github.com' && call.redirect === 'manual'));
});

test('public reading needs no token; mutation requires configured credential and caller mutation cannot rewrite an observation in flight', async () => {
  const publicRead = github(), noToken = createRepository({...config, token: undefined, fetchImpl: publicRead.fetchImpl});
  await noToken.read(); await rejects(noToken.publish(observation()), 'repository_write_credential_required'); assert.equal(publicRead.puts().length, 0);
  assert(publicRead.calls.every(call => !('authorization' in call.headers)));
  const mock = github(), input = observation(), expectedName = input.card.name;
  mock.override = () => { input.card.name = 'changed while await'; input.sha256 = 'f'.repeat(64); };
  const result = await repository(mock).publish(input);
  assert.equal(result.entry.name, expectedName); assert.notEqual(result.entry.card_sha256, input.sha256);
});
