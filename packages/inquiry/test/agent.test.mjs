import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgent, listTools, MAX_REQUEST_BYTES } from '../src/agent.mjs';

function harness(overrides = {}) {
  const calls = [];
  const methods = ['submit', 'status', 'acknowledge', 'retryReceipt', 'retryNotification', 'respond', 'freeze', 'pay', 'reconcilePayment', 'complete', 'close'];
  const participant = Object.fromEntries(methods.map(method => [method, async (...args) => {
    calls.push({ method, args });
    return { operation: method, args };
  }]));
  const agent = createAgent({
    participant,
    search: async query => { calls.push({ method: 'search', args: [query] }); return ['found']; },
    inspect: async id => { calls.push({ method: 'inspect', args: [id] }); return { listing_id: id }; },
    ...overrides,
  });
  return { agent, calls, participant };
}

test('explicit tool methods map to precisely one participant or discovery operation', async () => {
  const { agent, calls } = harness();
  const envelope = { payload: { inquiry_id: 'inq-1' }, signature: 'test' };
  const cases = [
    ['providers.search', { query: { capabilities: ['research'] } }, 'search', [{ capabilities: ['research'] }]],
    ['providers.inspect', { listing_id: 'listing-1' }, 'inspect', ['listing-1']],
    ['inquiry.submit', { envelope }, 'submit', [envelope]],
    ['inquiry.status', { inquiry_id: 'inq-1' }, 'status', ['inq-1']],
    ['receipt.acknowledge', { ack: envelope }, 'acknowledge', [envelope]],
    ['receipt.retry', { inquiry_id: 'inq-1' }, 'retryReceipt', ['inq-1']],
    ['notification.retry', { inquiry_id: 'inq-1' }, 'retryNotification', ['inq-1']],
    ['inquiry.respond', { inquiry_id: 'inq-1', decision: 'refer', reason: 'capacity', referral: { destination: envelope, authorization_ref: 'delegation-1', expires_at: '2026-10-04T00:00:00.000Z' } }, 'respond'],
    ['terms.freeze', { envelope }, 'freeze', [envelope]],
    ['payment.pay', { inquiry_id: 'inq-1' }, 'pay', ['inq-1']],
    ['payment.reconcile', { inquiry_id: 'inq-1' }, 'reconcilePayment', ['inq-1']],
    ['work.complete', { inquiry_id: 'inq-1', result_digest: 'a'.repeat(64), evidence: { uri: 'local:artifact' } }, 'complete'],
    ['work.close', { ack: envelope }, 'close', [envelope]],
  ];
  for (let i = 0; i < cases.length; i++) {
    const [method, params, expectedMethod, args = [params]] = cases[i];
    const reply = await agent.handle({ id: i, method, params });
    assert.equal(reply.id, i);
    assert.ok(Object.hasOwn(reply, 'result'), JSON.stringify(reply));
    assert.equal(calls.length, i + 1);
    assert.deepEqual(calls[i], { method: expectedMethod, args });
  }
});

test('tool discovery marks payment and mutation authorization, and cannot alter schemas', async () => {
  const { agent, calls } = harness();
  const reply = await agent.handle({ id: 'list', method: 'tools.list' });
  assert.equal(reply.result.tools.length, 14);
  const payment = reply.result.tools.find(tool => tool.name === 'payment.pay');
  assert.equal(payment.sideEffects.maySpendFunds, true);
  assert.equal(payment.sideEffects.requiresExplicitAuthorization, true);
  assert.equal(reply.result.tools.find(tool => tool.name === 'providers.search').sideEffects.readOnly, true);
  const reconcile = reply.result.tools.find(tool => tool.name === 'payment.reconcile');
  assert.equal(reconcile.sideEffects.maySpendFunds, true);
  assert.equal(reconcile.sideEffects.mayChargeProvider, false);
  assert.equal(reconcile.sideEffects.mayChargeWitnessFee, true);
  assert.equal(reply.result.tools.find(tool => tool.name === 'terms.freeze').sideEffects.maySpendFunds, true);
  assert.equal(reply.result.tools.find(tool => tool.name === 'receipt.acknowledge').sideEffects.maySpendFunds, false);
  assert.equal(reply.result.tools.find(tool => tool.name === 'notification.retry').sideEffects.requiresExplicitAuthorization, true);
  payment.inputSchema.required = [];
  listTools().find(tool => tool.name === 'payment.pay').inputSchema.required = [];
  const invalid = await agent.handle({ id: 1, method: 'payment.pay', params: {} });
  assert.equal(invalid.error.code, 'INVALID_PARAMS');
  assert.deepEqual(calls, []);
});

test('strict boundary rejects unknown methods, malformed requests, and unwanted params before dispatch', async () => {
  const { agent, calls } = harness();
  const invalid = [
    [null, 'INVALID_REQUEST'],
    [[], 'INVALID_REQUEST'],
    [{ method: 'tools.list' }, 'INVALID_REQUEST'],
    [{ id: null, method: 'tools.list' }, 'INVALID_REQUEST'],
    [{ id: 1.5, method: 'tools.list' }, 'INVALID_REQUEST'],
    [{ id: 1, method: 'tools.list', token: 'unexpected' }, 'INVALID_REQUEST'],
    [{ id: 1, method: 'constructor' }, 'METHOD_NOT_FOUND'],
    [{ id: 1, method: 'participant.deleteEverything' }, 'METHOD_NOT_FOUND'],
    [{ id: 1, method: 'inquiry.submit', params: { envelope: {} } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'inquiry.submit', params: { envelope: 'unsigned' } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'receipt.acknowledge', params: { inquiry_id: 'inq-1', delivered: true } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'inquiry.status', params: { inquiry_id: 'inq-1', pay: true } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'inquiry.respond', params: { inquiry_id: 'inq-1', decision: 'maybe' } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'inquiry.respond', params: { inquiry_id: 'inq-1', decision: 'accept', reason: 'x'.repeat(2049) } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'work.complete', params: { inquiry_id: 'inq-1', result_digest: 'x'.repeat(64), evidence: {} } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'providers.search', params: { query: { a: NaN } } }, 'INVALID_REQUEST'],
    [{ id: 1, method: 'providers.search', params: { query: { many: Array(513).fill(0) } } }, 'INVALID_REQUEST'],
    [{ id: 1, method: 'providers.search', params: { query: {} } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'providers.search', params: { query: { capabilities: ['research', 'research'] } } }, 'INVALID_PARAMS'],
    [{ id: 1, method: 'providers.search', params: { query: { capabilities: [123] } } }, 'INVALID_PARAMS'],
  ];
  for (const [request, code] of invalid) {
    const reply = await agent.handle(request);
    assert.equal(reply.error?.code, code, JSON.stringify(request));
    assert.ok(!Object.hasOwn(reply, 'result'));
  }
  const circular = { id: 1, method: 'providers.search', params: { query: {} } };
  circular.params.query.cycle = circular;
  assert.equal((await agent.handle(circular)).error.code, 'INVALID_REQUEST');
  const tooLarge = { id: 1, method: 'providers.search', params: { query: { a: 'x'.repeat(32768), b: 'x'.repeat(32768) } } };
  assert.ok(Buffer.byteLength(JSON.stringify(tooLarge)) > MAX_REQUEST_BYTES);
  assert.equal((await agent.handle(tooLarge)).error.code, 'REQUEST_TOO_LARGE');
  assert.deepEqual(calls, []);
});

test('input getters are rejected without executing them', async () => {
  const { agent, calls } = harness();
  let accessed = false;
  const request = { id: 1, method: 'inquiry.submit', params: {} };
  Object.defineProperty(request.params, 'envelope', { enumerable: true, get() { accessed = true; throw new Error('secret'); } });
  const reply = await agent.handle(request);
  assert.equal(reply.error.code, 'INVALID_REQUEST');
  assert.equal(accessed, false);
  const capabilities = [];
  Object.defineProperty(capabilities, '0', { enumerable: true, get() { accessed = true; throw new Error('secret'); } });
  const arrayReply = await agent.handle({ id: 2, method: 'providers.search', params: { query: { capabilities } } });
  assert.equal(arrayReply.error.code, 'INVALID_REQUEST');
  assert.equal(accessed, false);
  assert.deepEqual(calls, []);
});

test('transport success is returned without inventing signed acknowledgment or advancing payment', async () => {
  const { agent, participant, calls } = harness();
  participant.submit = async envelope => {
    calls.push({ method: 'submit', args: [envelope] });
    return { receipt: { signed: 'receipt' }, delivery: { transport_accepted: true, confirmed: false } };
  };
  const reply = await agent.handle({ id: 'submit', method: 'inquiry.submit', params: { envelope: { signed: 'inquiry' } } });
  assert.equal(reply.result.delivery.confirmed, false);
  assert.deepEqual(reply.result.receipt, { signed: 'receipt' });
  assert.deepEqual(calls.map(call => call.method), ['submit']);
});

test('coded participant errors are preserved while unexpected failures do not disclose details', async () => {
  const { agent, participant } = harness();
  participant.pay = async () => { throw Object.assign(new Error('Terms are not frozen.'), { code: 'TERMS_NOT_FROZEN' }); };
  const coded = await agent.handle({ id: 1, method: 'payment.pay', params: { inquiry_id: 'inq-1' } });
  assert.deepEqual(coded, { id: 1, error: { code: 'TERMS_NOT_FROZEN', message: 'Terms are not frozen.' } });
  participant.pay = async () => { throw new Error('Private adapter token is SECRET'); };
  const internal = await agent.handle({ id: 2, method: 'payment.pay', params: { inquiry_id: 'inq-1' } });
  assert.equal(internal.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(internal).includes('SECRET'));
  delete participant.pay;
  assert.equal((await agent.handle({ id: 3, method: 'payment.pay', params: { inquiry_id: 'inq-1' } })).error.code, 'METHOD_UNAVAILABLE');
});

const cli = fileURLToPath(new URL('../bin/agent.mjs', import.meta.url));

async function runCli(t, input, source) {
  const directory = await mkdtemp(join(tmpdir(), 'inquiry-agent-test-'));
  const config = join(directory, 'config.mjs');
  await writeFile(config, source, 'utf8');
  t.after(async () => { await unlink(config); await rmdir(directory); });
  const child = spawn(process.execPath, [cli, config], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const output = [];
  const diagnostics = [];
  child.stdout.on('data', chunk => output.push(chunk));
  child.stderr.on('data', chunk => diagnostics.push(chunk));
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', code => resolve(code));
  });
  child.stdin.end(input);
  const code = await completion;
  const stdout = Buffer.concat(output).toString('utf8');
  return { code, stdout, stderr: Buffer.concat(diagnostics).toString('utf8'), replies: stdout.trim() ? stdout.trim().split('\n').map(line => JSON.parse(line)) : [] };
}

const fixture = `
console.log('configuration diagnostic');
export default async function () {
  let count = 0;
  return {
    participant: {
      async submit(envelope) {
        await new Promise(resolve => setTimeout(resolve, 25));
        count++;
        return { delivery: { confirmed: false, transport_accepted: true }, envelope };
      },
      async status(id) { return { inquiry_id: id, count }; },
      async acknowledge() { throw new Error('Must never run automatically'); },
    },
    search: async query => ({ query }),
    inspect: async id => ({ listing_id: id }),
  };
}
`;

test('CLI serially awaits requests, reserves stdout for JSON, and never implicitly acknowledges', async t => {
  const input = [
    { id: 'first', method: 'inquiry.submit', params: { envelope: { signed: 'inquiry' } } },
    { id: 'second', method: 'inquiry.status', params: { inquiry_id: 'inq-1' } },
  ].map(value => JSON.stringify(value)).join('\r\n');
  const result = await runCli(t, input, fixture);
  assert.equal(result.code, 0);
  assert.match(result.stderr, /configuration diagnostic/);
  assert.equal(result.replies.length, 2);
  assert.equal(result.replies[0].id, 'first');
  assert.equal(result.replies[0].result.delivery.confirmed, false);
  assert.deepEqual(result.replies[1], { id: 'second', result: { inquiry_id: 'inq-1', count: 1 } });
});

test('CLI bounds huge lines, rejects bad JSON and UTF-8, and recovers at each next line', async t => {
  const valid = JSON.stringify({ id: 'recovered', method: 'providers.inspect', params: { listing_id: 'listing-1' } });
  const input = Buffer.concat([
    Buffer.from('x'.repeat(2 * 1024 * 1024) + '\n{broken}\n\n'),
    Buffer.from([0xff, 10]),
    Buffer.from(valid + '\n'),
  ]);
  const result = await runCli(t, input, fixture);
  assert.equal(result.code, 0);
  assert.deepEqual(result.replies.slice(0, 4).map(reply => reply.error.code), ['REQUEST_TOO_LARGE', 'PARSE_ERROR', 'PARSE_ERROR', 'PARSE_ERROR']);
  assert.deepEqual(result.replies[4], { id: 'recovered', result: { listing_id: 'listing-1' } });
});

test('CLI reports oversized final line without needing a newline', async t => {
  const result = await runCli(t, 'x'.repeat(MAX_REQUEST_BYTES + 1), fixture);
  assert.equal(result.code, 0);
  assert.equal(result.replies.length, 1);
  assert.equal(result.replies[0].error.code, 'REQUEST_TOO_LARGE');
});

test('CLI converts non-serializable adapter results into structured errors', async t => {
  const config = `export default async () => ({ participant: {}, search: async () => 1n, inspect: async () => ({}) });`;
  const result = await runCli(t, JSON.stringify({ id: 'bad-result', method: 'providers.search', params: { query: { capabilities: [] } } }), config);
  assert.equal(result.code, 0);
  assert.deepEqual(result.replies, [{ id: 'bad-result', error: { code: 'INVALID_RESULT', message: 'The configured operation returned a non-JSON result.' } }]);
});
