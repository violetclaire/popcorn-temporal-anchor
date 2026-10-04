import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixture } from '../examples/fixture.mjs';
import { digest, verifyEnvelope } from '../src/crypto.mjs';
import { searchProviders } from '../src/discovery.mjs';

async function setup(t, options) {
  const dir = await mkdtemp(join(tmpdir(), 'briarwood-inquiry-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, f: createFixture(dir, options) };
}
async function frozen(f, participant) {
  let state = await participant.submit(f.inquiry());
  state = await participant.respond({ inquiry_id: 'inquiry-1', decision: 'accept' });
  return participant.freeze(f.consent('freeze_terms', 'inquiry-1', {
    receipt_digest: digest(state.receipt), response_digest: digest(state.response), terms_digest: state.request.payload.terms_digest,
  }));
}

test('complete agent journey: search, inspect terms, receipt, ack, accept, freeze, pay, complete, close', async t => {
  const { f } = await setup(t);
  const found = searchProviders(f.listings, { capabilities: ['document-review'] }, { trust: f.trust, asOf: f.instant() });
  assert.equal(found.matches.length, 2);
  assert.equal(found.matches[0].listing.payload.terms.price.amount_atomic, '1000');
  const a = f.participant();
  let s = await a.submit(f.inquiry());
  assert.equal(s.phase, 'awaiting_response'); assert.equal(s.provider_accepted, false);
  assert.equal(s.acknowledgment_confirmed, false);
  assert.equal(verifyEnvelope(s.receipt, f.trust).meaning, 'inquiry_recorded_not_accepted');
  s = await a.retryReceipt('inquiry-1'); assert.equal(s.acknowledgment_confirmed, true);
  f.advance(1500);
  s = await a.respond({ inquiry_id: 'inquiry-1', decision: 'accept' });
  assert.equal(s.response_timing.elapsed_lower_ms, 1500); assert.equal(s.response_timing.deadline_met, true);
  s = await a.freeze(f.consent('freeze_terms', 'inquiry-1', { receipt_digest: digest(s.receipt), response_digest: digest(s.response), terms_digest: found.matches[0].terms_digest }));
  assert.equal(s.phase, 'frozen');
  s = await a.pay('inquiry-1'); assert.equal(s.phase, 'paid'); assert.equal(f.counters().payments, 1);
  await a.pay('inquiry-1'); assert.equal(f.counters().payments, 1);
  const result = digest({ review: 'Local synthetic result' });
  s = await a.complete({ inquiry_id: 'inquiry-1', result_digest: result, evidence: { type: 'synthetic_result', result_digest: result } });
  assert.equal(s.phase, 'awaiting_completion_ack');
  s = await a.close(f.consent('completion_ack', 'inquiry-1', { completion_digest: digest(s.completion) }));
  assert.equal(s.phase, 'closed');
  assert.equal((await f.participant().status('inquiry-1')).phase, 'closed');
});

test('malformed inputs never save an inquiry or call witness', async t => {
  const { dir, f } = await setup(t); const a = f.participant();
  for (const change of [{ need: null }, { need: {} }, { need: '' }, { expires_at: '1970-05-01T00:00:00Z' }, { terms_digest: '0'.repeat(64) }, { reply_endpoint: 'https://untrusted.example/ack' }]) {
    const p = { ...f.inquiry().payload, ...change };
    await assert.rejects(a.submit(f.signed(p)));
  }
  assert.equal(f.counters().witnesses, 0);
  const files = await readdir(join(dir, 'provider-a')).catch(() => []);
  assert.deepEqual(files, []);
});

test('receipt retained byte-for-byte on duplicate; changed key reuse rejected', async t => {
  const { f } = await setup(t); const a = f.participant(), request = f.inquiry();
  const first = await a.submit(request);
  f.advance(1000);
  const again = await f.participant().submit(request);
  assert.deepEqual(again.receipt, first.receipt); assert.equal(f.counters().witnesses, 1);
  await assert.rejects(a.submit(f.inquiry({ need: 'Different work' })), { code: 'inquiry_id_conflict' });
});

test('200 transport acceptance is unconfirmed; restart retries the SAME receipt and signed ack closes it', async t => {
  const { f } = await setup(t); let carried;
  const a = f.participant('provider-a', { deliver: async ({ receipt }) => { carried = receipt; return { status: 200 }; } });
  const original = await a.submit(f.inquiry());
  let s = await a.retryReceipt('inquiry-1'); assert.equal(s.confirmation.status, 'unconfirmed'); assert.equal(s.confirmation.attempts, 1);
  assert.deepEqual(carried, original.receipt);
  f.advance(1001); s = await f.participant().retryReceipt('inquiry-1');
  assert.equal(s.confirmation.status, 'confirmed'); assert.equal(s.confirmation.attempts, 2);
  assert.deepEqual(s.receipt, original.receipt); assert.equal(f.counters().witnesses, 1);
});

test('exhaustion remains visibly unconfirmed and cannot mint a substitute receipt', async t => {
  const { f } = await setup(t); const a = f.participant('provider-a', { retry: { max_attempts: 2, base_delay_ms: 1 }, deliver: async () => { throw Error('unavailable'); } });
  await a.submit(f.inquiry()); await a.retryReceipt('inquiry-1'); f.advance(3); await a.retryReceipt('inquiry-1'); f.advance(3);
  const s = await a.retryReceipt('inquiry-1');
  assert.equal(s.confirmation.status, 'unconfirmed'); assert.equal(s.confirmation.attempts, 2);
  assert.equal(s.confirmation.last_error, 'retry_exhausted_or_expired'); assert.equal(f.counters().witnesses, 1);
});

test('wrong signer or unrelated receipt cannot acknowledge delivery', async t => {
  const { f } = await setup(t); const a = f.participant(); const s = await a.submit(f.inquiry());
  const ack = f.ack(s.receipt);
  await assert.rejects(a.acknowledge(f.signed({ ...ack.payload, issuer: 'provider-b' }, 'provider-b')), { code: 'acknowledgment_mismatch' });
  await assert.rejects(a.acknowledge(f.signed({ ...ack.payload, receipt_digest: '0'.repeat(64) })), { code: 'acknowledgment_mismatch' });
});

test('signed referral retains prior receipt, validates destination and rejects altered chain or task', async t => {
  const { f } = await setup(t); const a = f.participant(), b = f.participant('provider-b');
  await a.submit(f.inquiry());
  const source = await a.respond({ inquiry_id: 'inquiry-1', decision: 'refer', referral: {
    destination: f.listings[1], authorization_ref: 'scoped-contact-and-disclosure-grant', expires_at: f.expiry,
  } });
  const chain = [{ receipt: source.receipt, response: source.response }];
  const request = f.inquiry({ provider: 'provider-b', inquiryId: 'inquiry-2', chain });
  const received = await b.submit(request); assert.equal(received.phase, 'awaiting_response');
  assert.deepEqual(received.request.payload.referral_chain, chain);
  await assert.rejects(b.submit(f.inquiry({ provider: 'provider-b', inquiryId: 'inquiry-3', chain, need: 'Changed task' })), { code: 'referral_chain_mismatch' });
  const bad = structuredClone(chain); bad[0].response.payload.referral.destination = f.listings[0];
  await assert.rejects(b.submit(f.inquiry({ provider: 'provider-b', inquiryId: 'inquiry-4', chain: bad })));
});

test('terms cannot change after acceptance and payment cannot precede bilateral freeze', async t => {
  const { f } = await setup(t); const a = f.participant();
  await a.submit(f.inquiry()); let s = await a.respond({ inquiry_id: 'inquiry-1', decision: 'accept' });
  await assert.rejects(a.pay('inquiry-1'), { code: 'invalid_transition' });
  await assert.rejects(a.freeze(f.consent('freeze_terms', 'inquiry-1', { receipt_digest: digest(s.receipt), response_digest: digest(s.response), terms_digest: '0'.repeat(64) })), { code: 'terms_freeze_mismatch' });
  assert.equal(f.counters().payments, 0);
});

test('lost payment response is reconciled with original key, never paid twice', async t => {
  const { f } = await setup(t); const adapter = { ...f.payment, pay: async intent => { await f.payment.pay(intent); throw Error('response lost'); } };
  const a = f.participant('provider-a', { payment: adapter }); await frozen(f, a);
  let s = await a.pay('inquiry-1'); assert.equal(s.phase, 'payment_unknown'); assert.equal(f.counters().payments, 1);
  await a.pay('inquiry-1'); assert.equal(f.counters().payments, 1);
  s = await f.participant().reconcilePayment('inquiry-1'); assert.equal(s.phase, 'paid'); assert.equal(f.counters().payments, 1);
});

test('unverified settlement and completion never become success', async t => {
  const { f } = await setup(t); const a = f.participant('provider-a', { payment: { ...f.payment, verify: async () => false } });
  await frozen(f, a); assert.equal((await a.pay('inquiry-1')).phase, 'payment_unknown');
  const b = f.participant(); await b.reconcilePayment('inquiry-1');
  await assert.rejects(b.complete({ inquiry_id: 'inquiry-1', result_digest: '1'.repeat(64), evidence: { type: 'claim_only' } }), { code: 'completion_unverified' });
});

test('zero-price terms use no payment adapter and still require scoped consent', async t => {
  const { f } = await setup(t, { amount: '0' }); const a = f.participant('provider-a', { payment: undefined });
  await frozen(f, a); const s = await a.pay('inquiry-1'); assert.equal(s.payment.payload.type, 'payment_not_required'); assert.equal(f.counters().payments, 0);
});

test('concurrent submit has one receipt; corrupted durable state fails closed', async t => {
  const { dir, f } = await setup(t); const a = f.participant(), request = f.inquiry();
  const results = await Promise.allSettled([a.submit(request), a.submit(request)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length >= 1, true); assert.equal(f.counters().witnesses, 1);
  const folder = join(dir, 'provider-a'); const filename = (await readdir(folder)).find(x => x.endsWith('.json'));
  await writeFile(join(folder, filename), '{}');
  await assert.rejects(a.submit(request), { code: 'state_corrupt' });
  assert.equal(f.counters().witnesses, 1);
});

test('authorization and witness failures cannot leave a successful inquiry', async t => {
  const { f } = await setup(t);
  await assert.rejects(f.participant('provider-a', { authorize: async () => false }).submit(f.inquiry()), { code: 'authorization_denied' });
  await assert.rejects(f.participant('provider-a', { witness: { ...f.witness, verify: async () => ({ valid: true }) } }).submit(f.inquiry()), { code: 'witness_invalid' });
  await assert.rejects(f.participant().status('inquiry-1'), { code: 'inquiry_not_found' });
});

test('optional notifications can fail without changing mandatory receipt semantics', async t => {
  const { f } = await setup(t); const a = f.participant('provider-a', { notify: async () => { throw Error('optional alert failed'); } });
  const s = await a.submit(f.inquiry()); assert.ok(s.receipt.jws); assert.equal(s.confirmation.status, 'unconfirmed');
});

test('overlapping independent witness intervals preserve conservative response timing', async t => {
  const { f } = await setup(t);
  let count = 0;
  const witness = {
    ...f.witness,
    async commit(binding) {
      count++;
      const center = Date.parse(f.instant());
      // The later response has a wider interval and an earlier lower bound.
      const radius = count === 1 ? 1000 : 3000;
      return f.signed({ ...binding, issuer: 'test-witness', type: 'synthetic_witness', id: `overlap-${count}`,
        lower: new Date(center - radius).toISOString(), upper: new Date(center + radius).toISOString() }, 'test-witness');
    },
  };
  const a = f.participant('provider-a', { witness });
  await a.submit(f.inquiry()); f.advance(100);
  const s = await a.respond({ inquiry_id: 'inquiry-1', decision: 'accept' });
  assert.equal(s.response_timing.elapsed_lower_ms, 0);
  assert.equal(s.response_timing.elapsed_upper_ms, 4100);
  assert.equal(s.response_timing.deadline_met, true);
});
