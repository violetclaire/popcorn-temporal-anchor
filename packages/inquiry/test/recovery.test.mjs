import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createFixture } from '../examples/fixture.mjs';
import { digest, verifyEnvelope } from '../src/crypto.mjs';

async function setup(t, options) {
  const dir = await mkdtemp(join(tmpdir(), 'briarwood-recovery-'));
  t.after(async () => {
    const target = resolve(dir);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep));
    assert.ok(target.slice(resolve(tmpdir()).length + 1).startsWith('briarwood-recovery-'));
    await rm(target, { recursive: true, force: true });
  });
  return { dir, f: createFixture(dir, options) };
}

async function accepted(f, participant, request = f.inquiry()) {
  await participant.submit(request);
  return participant.respond({ inquiry_id: request.payload.inquiry_id, decision: 'accept' });
}

function freezeConsent(f, state, changes = {}) {
  return f.consent('freeze_terms', state.request.payload.inquiry_id, {
    receipt_digest: digest(state.receipt), response_digest: digest(state.response),
    terms_digest: state.request.payload.terms_digest, ...changes,
  });
}

async function frozen(f, participant, request) {
  const state = await accepted(f, participant, request);
  return participant.freeze(freezeConsent(f, state));
}

async function referral(f) {
  const provider = f.participant();
  await provider.submit(f.inquiry());
  const state = await provider.respond({ inquiry_id: 'inquiry-1', decision: 'refer', referral: {
    destination: f.listings[1], authorization_ref: 'one-inquiry-disclosure', expires_at: f.expiry,
  } });
  return { receipt: state.receipt, response: state.response };
}

// Re-sign AND re-witness changed content so the negative tests exercise semantic
// validation of authentic malformed messages, not just a broken signature.
async function reissue(f, envelope, mutate) {
  const { witness: _oldWitness, ...core } = structuredClone(envelope.payload);
  mutate(core);
  const evidence = await f.witness.commit({ digest: digest(core), previous_digest: core.previous_event_digest });
  const attestation = verifyEnvelope(evidence, f.trust);
  return f.signed({ ...core, witness: {
    id: attestation.id, lower: attestation.lower, upper: attestation.upper, evidence,
  } }, core.issuer);
}

test('authentic witnessed referral with missing hop IDs is rejected before another receipt exists', async t => {
  const { f } = await setup(t);
  const original = await referral(f);
  const receipt = await reissue(f, original.receipt, core => {
    delete core.inquiry_id;
    delete core.inquiry_digest;
  });
  const response = await reissue(f, original.response, core => {
    delete core.inquiry_id;
    delete core.inquiry_digest;
    core.previous_event_digest = digest(receipt);
  });
  const b = f.participant('provider-b');
  const before = f.counters().witnesses;
  await assert.rejects(b.submit(f.inquiry({ provider: 'provider-b', inquiryId: 'malformed-hop',
    chain: [{ receipt, response }] })), { code: 'invalid_shape' });
  assert.equal(f.counters().witnesses, before);
  await assert.rejects(b.status('malformed-hop'), { code: 'inquiry_not_found' });

  // The same source's unmodified chain remains useful.
  const valid = await b.submit(f.inquiry({ provider: 'provider-b', inquiryId: 'valid-hop', chain: [original] }));
  assert.equal(valid.phase, 'awaiting_response');
});

test('a separately valid witnessed response cannot substitute the prior hop terms', async t => {
  const { f } = await setup(t);
  const original = await referral(f);
  const response = await reissue(f, original.response, core => { core.terms_digest = digest({ other: 'terms' }); });
  const b = f.participant('provider-b');
  const before = f.counters().witnesses;
  await assert.rejects(b.submit(f.inquiry({ provider: 'provider-b', inquiryId: 'changed-hop-terms',
    chain: [{ receipt: original.receipt, response }] })), { code: 'referral_chain_mismatch' });
  assert.equal(f.counters().witnesses, before);
  await assert.rejects(b.status('changed-hop-terms'), { code: 'inquiry_not_found' });
});

test('settlement acknowledged after expiry can be reconciled without renewing work or paying again', async t => {
  const { f } = await setup(t);
  const a = f.participant('provider-a', { payment: {
    ...f.payment,
    pay: async intent => { await f.payment.pay(intent); throw new Error('settlement response lost'); },
  } });
  const agreement = await frozen(f, a);
  const uncertain = await a.pay('inquiry-1');
  assert.equal(uncertain.phase, 'payment_unknown');
  assert.equal(f.counters().payments, 1);
  f.advance(Date.parse(f.expiry) - Date.parse(f.instant()) + 1);

  const restarted = f.participant();
  const recovered = await restarted.reconcilePayment('inquiry-1');
  assert.equal(recovered.phase, 'paid');
  assert.equal(f.counters().payments, 1);
  assert.equal(recovered.payment.payload.payment_intent.idempotency_key, uncertain.payment_intent.idempotency_key);
  assert.equal(recovered.payment.payload.payment_intent.frozen_digest, digest(agreement.frozen));
  assert.equal(recovered.payment.payload.inquiry_expires_at, f.expiry);
  assert.ok(Date.parse(recovered.payment.payload.witness.lower) > Date.parse(f.expiry));
  assert.equal(Object.hasOwn(recovered.payment.payload, 'expires_at'), false);
  await restarted.pay('inquiry-1');
  await restarted.reconcilePayment('inquiry-1');
  assert.equal(f.counters().payments, 1);

  const result = digest({ result: 'late work' });
  await assert.rejects(restarted.complete({ inquiry_id: 'inquiry-1', result_digest: result,
    evidence: { type: 'synthetic_result', result_digest: result } }), { code: 'inquiry_expired' });
});

test('late successful payment response records history even when the inquiry expires in flight', async t => {
  const { f } = await setup(t);
  const a = f.participant('provider-a', { payment: {
    ...f.payment,
    pay: async intent => {
      const evidence = await f.payment.pay(intent);
      f.advance(Date.parse(f.expiry) - Date.parse(f.instant()) + 1);
      return evidence;
    },
  } });
  await frozen(f, a);
  const settled = await a.pay('inquiry-1');
  assert.equal(settled.phase, 'paid');
  assert.equal(settled.payment.payload.inquiry_expires_at, f.expiry);
  assert.ok(Date.parse(settled.payment.payload.issued_at) > Date.parse(f.expiry));
  assert.equal(f.counters().payments, 1);
});

test('hanging optional alert never runs during submission and its timeout leaves receipt delivery usable', { timeout: 5000 }, async t => {
  const { f } = await setup(t);
  let notifications = 0;
  const a = f.participant('provider-a', { notify: () => {
    notifications++;
    return new Promise(() => {});
  } });
  const recorded = await a.submit(f.inquiry());
  assert.equal(notifications, 0);
  assert.ok(recorded.receipt.jws);
  assert.equal(recorded.notification.status, 'pending');
  assert.equal(recorded.confirmation.status, 'unconfirmed');

  const attempted = await a.retryNotification('inquiry-1');
  assert.equal(notifications, 1);
  assert.equal(attempted.notification.status, 'unconfirmed');
  assert.deepEqual(attempted.receipt, recorded.receipt);
  const delivered = await a.retryReceipt('inquiry-1');
  assert.equal(delivered.confirmation.status, 'confirmed');
  assert.equal(delivered.notification.status, 'unconfirmed');
  assert.equal(f.counters().witnesses, 1);
});

test('only exact signed freeze consent also confirms receipt and survives restart', async t => {
  const { f } = await setup(t, { amount: '0' });
  const a = f.participant();
  const proposal = await accepted(f, a);
  assert.equal(proposal.confirmation.status, 'unconfirmed');
  await assert.rejects(a.freeze(freezeConsent(f, proposal, { receipt_digest: digest({ other: 'receipt' }) })),
    { code: 'terms_freeze_mismatch' });
  assert.equal((await a.status('inquiry-1')).confirmation.status, 'unconfirmed');

  const consent = freezeConsent(f, proposal);
  const agreement = await a.freeze(consent);
  assert.equal(agreement.confirmation.status, 'confirmed');
  assert.equal(agreement.confirmation.acknowledgment_kind, 'freeze_terms');
  assert.deepEqual(agreement.confirmation.acknowledgment, consent);
  assert.equal(agreement.confirmation.next_attempt_at, null);
  const restarted = f.participant();
  assert.deepEqual((await restarted.status('inquiry-1')).confirmation, agreement.confirmation);
  await restarted.pay('inquiry-1');
  const result = digest({ result: 'accepted local output' });
  const delivered = await restarted.complete({ inquiry_id: 'inquiry-1', result_digest: result,
    evidence: { type: 'synthetic_result', result_digest: result } });
  const closed = await restarted.close(f.consent('completion_ack', 'inquiry-1', { completion_digest: digest(delivered.completion) }));
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.acknowledgment_confirmed, true);

  const before = f.counters();
  f.advance(Date.parse(f.expiry) - Date.parse(f.instant()) + 1);
  const historical = await restarted.freeze(consent);
  assert.equal(historical.phase, 'closed');
  assert.deepEqual(historical.frozen, agreement.frozen);
  assert.deepEqual(f.counters(), before);
});

test('expired requester freeze consent cannot authorize a new payment while inquiry is still live', async t => {
  const { f } = await setup(t);
  const a = f.participant();
  const proposal = await accepted(f, a);
  const consent = freezeConsent(f, proposal, { expires_at: new Date(Date.parse(f.instant()) + 1000).toISOString() });
  await a.freeze(consent);
  f.advance(1000);
  const before = f.counters();
  await assert.rejects(a.pay('inquiry-1'), { code: 'expired_or_uncertain' });
  assert.deepEqual(f.counters(), before);
  assert.equal((await a.status('inquiry-1')).phase, 'frozen');
});

test('a new freeze after inquiry expiry cannot revive provider acceptance', async t => {
  const { f } = await setup(t);
  const a = f.participant();
  const proposal = await accepted(f, a);
  f.advance(Date.parse(f.expiry) - Date.parse(f.instant()) + 1);
  const freshConsent = freezeConsent(f, proposal, { expires_at: new Date(Date.parse(f.instant()) + 60_000).toISOString() });
  const before = f.counters();
  await assert.rejects(a.freeze(freshConsent), { code: 'inquiry_expired' });
  assert.deepEqual(f.counters(), before);
  const state = await a.status('inquiry-1');
  assert.equal(state.phase, 'accepted');
  assert.equal(state.confirmation.status, 'unconfirmed');
});

test('stable payment key lets a transactional adapter prevent duplicate effect after local state loss', async t => {
  const { dir, f } = await setup(t);
  const settlementByKey = new Map(), attempts = [];
  let effects = 0;
  const adapter = {
    async pay(intent) {
      attempts.push(structuredClone(intent));
      if (!settlementByKey.has(intent.idempotency_key)) {
        effects++;
        settlementByKey.set(intent.idempotency_key, { effect: 'settlement-' + effects, intent_digest: digest(intent) });
      }
      return settlementByKey.get(intent.idempotency_key);
    },
    async lookup(intent) { return settlementByKey.get(intent.idempotency_key); },
    async verify(evidence, intent) { return evidence?.intent_digest === digest(intent); },
  };
  const request = f.inquiry();
  const original = f.participant('provider-a', { payment: adapter });
  await frozen(f, original, request);
  assert.equal((await original.pay('inquiry-1')).phase, 'paid');

  // A fresh directory simulates loss of participant storage. It does not pretend
  // to prove power-cut durability of the filesystem or the external adapter.
  f.advance(1000);
  const rebuilt = f.participant('provider-a', { payment: adapter, storeDir: join(dir, 'recovered-provider-a') });
  await frozen(f, rebuilt, request);
  const result = await rebuilt.pay('inquiry-1');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].idempotency_key, attempts[1].idempotency_key);
  assert.notEqual(attempts[0].frozen_digest, attempts[1].frozen_digest);
  assert.equal(effects, 1);
  // Old settlement cannot silently authenticate a newly constructed agreement.
  assert.equal(result.phase, 'payment_unknown');
});
