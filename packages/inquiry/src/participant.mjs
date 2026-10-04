import { canonical, digest, signEnvelope, verifyEnvelope } from './crypto.mjs';
import { validateListing } from './discovery.mjs';
import { createStore } from './store.mjs';
import { PROTOCOL, assert, fail, shape, id, hash, text, time, interval, live, endpoint, object } from './rules.mjs';

const clone = value => JSON.parse(canonical(value));
const iso = n => new Date(n).toISOString();
const rootTask = p => digest({ requester: p.issuer, capability: p.capability, need: p.need });
const eventBase = ['protocol', 'type', 'issuer', 'inquiry_id', 'issued_at', 'expires_at'];

/**
 * Private, participant-owned lifecycle. All authority, clock, witness, payment,
 * transport and completion adapters are installed by the local operator.
 * No network call or payment occurs merely by constructing this object.
 */
export function createParticipant({
  identity, trust, listings, storeDir, clock, witness, authorize,
  deliver, payment, completion, notify, retry = {},
} = {}) {
  assert(identity && id(identity.id) && object(trust) && Array.isArray(listings) &&
    typeof clock === 'function' && typeof authorize === 'function' &&
    typeof witness?.commit === 'function' && typeof witness?.verify === 'function', 'configuration_incomplete');
  const pins = clone(trust), offers = clone(listings), store = createStore(storeDir);
  const maxAttempts = retry.max_attempts ?? 5;
  const baseDelay = retry.base_delay_ms ?? 1000;
  assert(Number.isSafeInteger(maxAttempts) && maxAttempts > 0 && maxAttempts <= 20 &&
    Number.isSafeInteger(baseDelay) && baseDelay >= 1 && baseDelay <= 60_000, 'invalid_retry_policy');

  async function now() { return interval(await clock()); }
  async function permit(action, details) {
    assert(await authorize({ action, participant_id: identity.id, ...clone(details) }) === true, 'authorization_denied');
  }
  function signed(envelope, type) {
    const p = verifyEnvelope(envelope, pins);
    assert(p.protocol === PROTOCOL && p.type === type && id(p.inquiry_id), 'wrong_message_type');
    return p;
  }
  function current(record, n) {
    assert(record, 'inquiry_not_found');
    assert(n.upper < time(record.request.payload.expires_at), 'inquiry_expired');
  }
  function requirePhase(record, phases) {
    assert(record && phases.includes(record.phase), 'invalid_transition');
  }
  function view(record) {
    assert(record, 'inquiry_not_found');
    const result = clone(record);
    if (result.phase === 'payment_pending') result.phase = 'payment_unknown';
    result.acknowledgment_confirmed = result.confirmation.status === 'confirmed';
    result.provider_accepted = ['accepted', 'frozen', 'payment_pending', 'payment_unknown', 'paid', 'awaiting_completion_ack', 'closed'].includes(record.phase);
    return result;
  }
  async function verifyWitness(event) {
    const p = verifyEnvelope(event, pins), { witness: attached, ...core } = p;
    const shared = ['protocol', 'type', 'issuer', 'inquiry_id', 'issued_at', 'inquiry_expires_at',
      'inquiry_digest', 'root_task_digest', 'requester_id', 'terms_digest', 'previous_event_digest', 'witness'];
    if (p.type === 'receipt') shape(p, [...shared, 'meaning', 'referral_chain_digest', 'response_due_at', 'message']);
    else if (p.type === 'response') shape(p, [...shared, 'decision', 'reason', 'referral_chain_digest'], ['referral']);
    else fail('invalid_referral_event');
    assert(p.protocol === PROTOCOL && id(p.issuer) && id(p.inquiry_id) && id(p.requester_id) &&
      hash(p.inquiry_digest) && hash(p.root_task_digest) && hash(p.terms_digest) && hash(p.referral_chain_digest), 'invalid_referral_event');
    assert(time(p.issued_at) < time(p.inquiry_expires_at), 'invalid_referral_event');
    if (p.type === 'receipt') assert(p.meaning === 'inquiry_recorded_not_accepted' && p.previous_event_digest === null && text(p.message) &&
      time(p.response_due_at) <= time(p.inquiry_expires_at), 'invalid_referral_event');
    else assert(['accept', 'refer', 'decline'].includes(p.decision) && hash(p.previous_event_digest) &&
      typeof p.reason === 'string' && p.reason.length <= 2048 && (p.decision === 'refer') === Object.hasOwn(p, 'referral'), 'invalid_referral_event');
    assert(object(attached), 'witness_missing');
    const result = await witness.verify(clone(attached.evidence), {
      digest: digest(core), previous_digest: core.previous_event_digest,
    });
    assert(result?.valid === true && result.digest === digest(core) &&
      result.previous_digest === core.previous_event_digest &&
      result.id === attached.id && result.lower === attached.lower && result.upper === attached.upper,
    'witness_invalid');
    const window = interval(result);
    assert(window.upper >= time(p.issued_at) && window.upper < time(p.inquiry_expires_at), 'invalid_referral_event');
    return p;
  }
  async function event(record, type, fields, n, predecessor) {
    const core = {
      protocol: PROTOCOL, type, issuer: identity.id,
      inquiry_id: record.request.payload.inquiry_id,
      issued_at: iso(n.lower), inquiry_expires_at: record.request.payload.expires_at,
      inquiry_digest: record.inquiry_digest, root_task_digest: rootTask(record.request.payload),
      requester_id: record.request.payload.issuer,
      terms_digest: record.request.payload.terms_digest,
      previous_event_digest: predecessor ? digest(predecessor) : null,
      ...fields,
    };
    const binding = { digest: digest(core), previous_digest: core.previous_event_digest };
    const evidence = await witness.commit(clone(binding));
    const checked = await witness.verify(clone(evidence), clone(binding));
    assert(checked?.valid === true && checked.digest === binding.digest &&
      checked.previous_digest === binding.previous_digest && text(checked.id, 200), 'witness_invalid');
    const observed = interval(checked);
    const historicalSettlement = type === 'payment_settled';
    // Independent time intervals can overlap even for causally ordered events.
    // Reject an interval wholly before this observation; the signed predecessor
    // binding, rather than disjoint timestamp bounds, supplies event order.
    assert(observed.upper >= n.lower && (historicalSettlement || observed.upper < time(core.inquiry_expires_at)), 'witness_outside_window');
    // A host verifier establishes this interval. A remote `verified:true` field
    // is never used as verification.
    return signEnvelope({ ...core, witness: {
      id: checked.id, lower: checked.lower, upper: checked.upper, evidence: clone(evidence),
    } }, identity);
  }
  async function checkReferrals(p, n) {
    assert(Array.isArray(p.referral_chain) && p.referral_chain.length <= 8, 'invalid_referral_chain');
    const visited = new Set(), prefix = [];
    for (let i = 0; i < p.referral_chain.length; i++) {
      const hop = p.referral_chain[i];
      shape(hop, ['receipt', 'response']);
      const receipt = await verifyWitness(hop.receipt), response = await verifyWitness(hop.response);
      assert(receipt.type === 'receipt' && response.type === 'response' && response.decision === 'refer' &&
        receipt.protocol === PROTOCOL && response.protocol === PROTOCOL &&
        response.issuer === receipt.issuer && response.inquiry_id === receipt.inquiry_id &&
        response.inquiry_digest === receipt.inquiry_digest &&
        response.terms_digest === receipt.terms_digest &&
        time(response.issued_at) >= time(receipt.issued_at) &&
        response.previous_event_digest === digest(hop.receipt) &&
        response.requester_id === p.issuer && receipt.requester_id === p.issuer &&
        response.root_task_digest === rootTask(p) && receipt.root_task_digest === rootTask(p) &&
        receipt.referral_chain_digest === digest(prefix) && response.referral_chain_digest === digest(prefix), 'referral_chain_mismatch');
      assert(!visited.has(response.issuer), 'referral_loop'); visited.add(response.issuer);
      const referral = response.referral;
      shape(referral, ['destination', 'authorization_ref', 'expires_at', 'scope']);
      assert(id(referral.authorization_ref) && referral.scope === 'single_inquiry' && n.upper < time(referral.expires_at), 'referral_not_authorized');
      const destination = validateListing(referral.destination, { trust: pins, asOf: iso(n.upper) });
      assert(destination.issuer === (i + 1 < p.referral_chain.length ? p.referral_chain[i + 1].response.payload.issuer : identity.id), 'referral_wrong_destination');
      if (i + 1 === p.referral_chain.length) assert(digest(referral.destination) === p.listing_digest, 'referral_listing_changed');
      prefix.push(hop);
    }
    assert(!visited.has(identity.id), 'referral_loop');
  }
  async function submit(input) {
    const envelope = clone(input), p = signed(envelope, 'inquiry');
    shape(p, [...eventBase, 'provider_id', 'listing_digest', 'terms_digest', 'capability', 'need', 'reply_endpoint', 'referral_chain']);
    assert(p.provider_id === identity.id && hash(p.listing_digest) && hash(p.terms_digest) &&
      text(p.capability, 100) && text(p.need), 'invalid_inquiry');
    endpoint(p.reply_endpoint, p.issuer, pins);
    const inquiryDigest = digest(envelope);
    return store.transaction(p.inquiry_id, async (prior, save) => {
      if (prior) {
        assert(prior.inquiry_digest === inquiryDigest, 'inquiry_id_conflict');
        return view(prior); // Retained historical receipt; no second mint.
      }
      const n = await now(); live(p, n);
      const listing = offers.find(candidate => digest(candidate) === p.listing_digest);
      assert(listing, 'listing_not_found');
      const offered = validateListing(listing, { trust: pins, asOf: iso(n.upper) });
      validateListing(listing, { trust: pins, asOf: iso(n.lower) });
      assert(offered.issuer === identity.id && digest(offered.terms) === p.terms_digest &&
        offered.capabilities.includes(p.capability), 'terms_or_capability_mismatch');
      assert(time(p.expires_at) <= time(offered.expires_at), 'inquiry_exceeds_offer');
      await checkReferrals(p, n);
      await permit('receive_inquiry', { request: envelope, listing });
      const record = {
        version: 1, request: envelope, inquiry_digest: inquiryDigest, listing,
        phase: 'awaiting_response',
        confirmation: { status: 'unconfirmed', attempts: 0, next_attempt_at: iso(n.lower), last_error: null },
        notification: { status: typeof notify === 'function' ? 'pending' : 'disabled' },
      };
      record.receipt = await event(record, 'receipt', {
        meaning: 'inquiry_recorded_not_accepted',
        referral_chain_digest: digest(p.referral_chain),
        response_due_at: iso(Math.min(n.lower + offered.response_within_ms, time(p.expires_at))),
        message: 'Inquiry recorded; provider response pending.',
      }, n, null);
      // One atomic save includes both inquiry and signed receipt. If it fails,
      // no success or delivered receipt is returned.
      await save(record);
      return view(record);
    });
  }
  function validateAck(envelope, record, n, type = 'receipt_ack') {
    const p = signed(envelope, type);
    const binding = type === 'receipt_ack' ? 'receipt_digest' : 'completion_digest';
    shape(p, [...eventBase, binding]); live(p, n);
    assert(p.issuer === record.request.payload.issuer && p.inquiry_id === record.request.payload.inquiry_id &&
      p[binding] === digest(type === 'receipt_ack' ? record.receipt : record.completion), 'acknowledgment_mismatch');
    return p;
  }
  async function acknowledge(input) {
    const envelope = clone(input), p = signed(envelope, 'receipt_ack');
    return store.transaction(p.inquiry_id, async (record, save) => {
      assert(record, 'inquiry_not_found');
      validateAck(envelope, record, await now());
      record.confirmation = { ...record.confirmation, status: 'confirmed', acknowledgment: envelope, next_attempt_at: null, last_error: null };
      await save(record); return view(record);
    });
  }
  async function retryReceipt(inquiryId) {
    assert(id(inquiryId), 'invalid_inquiry_id');
    return store.transaction(inquiryId, async (record, save) => {
      assert(record, 'inquiry_not_found');
      const c = record.confirmation, n = await now();
      if (c.status === 'confirmed') return view(record);
      if (n.upper >= time(record.request.payload.expires_at) || c.attempts >= maxAttempts) {
        c.next_attempt_at = null; c.last_error = 'retry_exhausted_or_expired'; await save(record); return view(record);
      }
      if (c.next_attempt_at && n.lower < time(c.next_attempt_at)) return view(record);
      assert(typeof deliver === 'function', 'delivery_adapter_required');
      const url = endpoint(record.request.payload.reply_endpoint, record.request.payload.issuer, pins);
      await permit('deliver_receipt', { inquiry_id: inquiryId, recipient: record.request.payload.issuer, endpoint: url, receipt_digest: digest(record.receipt) });
      c.attempts++;
      // Persist the attempt and next deadline before transport; a process crash
      // consumes the attempt and never invents a successful delivery.
      c.next_attempt_at = iso(Math.min(time(record.request.payload.expires_at), n.upper + Math.min(60_000, baseDelay * 2 ** (c.attempts - 1))));
      c.last_error = 'delivery_unconfirmed'; await save(record);
      try {
        const ack = await deliver({ endpoint: url, recipient_id: record.request.payload.issuer, receipt: clone(record.receipt), attempt: c.attempts });
        validateAck(ack, record, await now());
        c.status = 'confirmed'; c.acknowledgment = clone(ack); c.next_attempt_at = null; c.last_error = null;
      } catch { c.last_error = 'delivery_unconfirmed'; }
      await save(record); return view(record);
    });
  }
  async function respond(input) {
    const command = clone(input);
    shape(command, ['inquiry_id', 'decision'], ['reason', 'referral']);
    assert(id(command.inquiry_id) && ['accept', 'refer', 'decline'].includes(command.decision) &&
      (command.reason === undefined || text(command.reason)), 'invalid_response');
    assert((command.decision === 'refer') === Object.hasOwn(command, 'referral'), 'invalid_referral');
    return store.transaction(command.inquiry_id, async (record, save) => {
      requirePhase(record, ['awaiting_response']); const n = await now(); current(record, n);
      const fields = { decision: command.decision, reason: command.reason ?? '', referral_chain_digest: digest(record.request.payload.referral_chain) };
      if (command.referral) {
        shape(command.referral, ['destination', 'authorization_ref', 'expires_at']);
        const dest = validateListing(command.referral.destination, { trust: pins, asOf: iso(n.upper) });
        assert(dest.issuer !== identity.id && id(command.referral.authorization_ref) &&
          n.upper < time(command.referral.expires_at) && time(command.referral.expires_at) <= time(record.request.payload.expires_at) &&
          dest.capabilities.includes(record.request.payload.capability), 'invalid_referral');
        fields.referral = { ...command.referral, scope: 'single_inquiry' };
        await permit('refer', { request: record.request, referral: fields.referral });
      }
      await permit('respond', { request: record.request, decision: command.decision, terms: record.listing.payload.terms });
      record.response = await event(record, 'response', fields, n, record.receipt);
      const start = interval(record.receipt.payload.witness), end = interval(record.response.payload.witness);
      assert(end.upper >= start.lower, 'witness_time_reversed');
      const lower = Math.max(0, end.lower - start.upper), upper = end.upper - start.lower;
      // Store derived timing separately; original signed event bytes are retained.
      record.response_timing = { elapsed_lower_ms: lower, elapsed_upper_ms: upper,
        deadline_met: end.upper <= time(record.receipt.payload.response_due_at) ? true : end.lower > time(record.receipt.payload.response_due_at) ? false : null };
      record.phase = { accept: 'accepted', refer: 'referred', decline: 'declined' }[command.decision];
      await save(record); return view(record);
    });
  }
  async function freeze(input) {
    const envelope = clone(input), p = signed(envelope, 'freeze_terms');
    shape(p, [...eventBase, 'receipt_digest', 'response_digest', 'terms_digest']);
    return store.transaction(p.inquiry_id, async (record, save) => {
      if (record?.freeze_request && digest(record.freeze_request) === digest(envelope)) return view(record);
      requirePhase(record, ['accepted']); const n = await now(); current(record, n); live(p, n);
      assert(p.issuer === record.request.payload.issuer && p.receipt_digest === digest(record.receipt) &&
        p.response_digest === digest(record.response) && p.terms_digest === record.request.payload.terms_digest, 'terms_freeze_mismatch');
      await permit('freeze_terms', { request: record.request, consent: envelope, terms: record.listing.payload.terms });
      record.freeze_request = envelope;
      record.frozen = await event(record, 'terms_frozen', {
        consent_digest: digest(envelope), terms: record.listing.payload.terms,
      }, n, record.response);
      // Explicit requester-signed consent binds the exact receipt bytes too.
      // This is checkable acknowledgment even if the initial callback was lost.
      record.confirmation = { ...record.confirmation, status: 'confirmed',
        acknowledgment: envelope, acknowledgment_kind: 'freeze_terms', next_attempt_at: null, last_error: null };
      record.phase = 'frozen'; await save(record); return view(record);
    });
  }
  function paymentIntent(record) {
    return {
      idempotency_key: digest({ protocol: PROTOCOL, requester_id: record.request.payload.issuer, provider_id: identity.id,
        inquiry_id: record.request.payload.inquiry_id, inquiry_digest: record.inquiry_digest, terms_digest: record.request.payload.terms_digest }),
      inquiry_id: record.request.payload.inquiry_id, requester_id: record.request.payload.issuer,
      provider_id: identity.id, frozen_digest: digest(record.frozen), terms_digest: record.request.payload.terms_digest,
      ...record.frozen.payload.terms.price,
    };
  }
  async function finishPayment(record, evidence, n, save) {
    const intent = paymentIntent(record);
    assert(typeof payment?.verify === 'function', 'payment_adapter_required');
    const checked = await payment.verify(clone(evidence), clone(intent));
    if (checked !== true) {
      record.phase = 'payment_unknown'; record.payment_error = 'settlement_unverified'; await save(record); return view(record);
    }
    record.payment = await event(record, 'payment_settled', {
      payment_intent: intent, settlement_evidence: clone(evidence),
    }, n, record.frozen);
    record.phase = 'paid'; delete record.payment_error; await save(record); return view(record);
  }
  async function pay(inquiryId) {
    assert(id(inquiryId), 'invalid_inquiry_id');
    return store.transaction(inquiryId, async (record, save) => {
      if (record && ['paid', 'awaiting_completion_ack', 'closed', 'payment_pending', 'payment_unknown'].includes(record.phase)) return view(record);
      requirePhase(record, ['frozen']); const n = await now(); current(record, n); live(record.freeze_request.payload, n);
      const intent = paymentIntent(record);
      await permit('pay', { payment_intent: intent, consent: record.freeze_request });
      if (intent.amount_atomic === '0') {
        record.payment = await event(record, 'payment_not_required', { payment_intent: intent }, n, record.frozen);
        record.phase = 'paid'; await save(record); return view(record);
      }
      assert(typeof payment?.pay === 'function' && typeof payment?.verify === 'function' && typeof payment?.lookup === 'function', 'payment_adapter_required');
      record.phase = 'payment_pending'; record.payment_intent = intent; await save(record);
      try {
        const evidence = await payment.pay(clone(intent));
        return await finishPayment(record, evidence, await now(), save);
      } catch {
        record.phase = 'payment_unknown'; record.payment_error = 'payment_or_witness_result_ambiguous';
        await save(record); return view(record);
      }
    });
  }
  async function reconcilePayment(inquiryId) {
    assert(id(inquiryId), 'invalid_inquiry_id');
    return store.transaction(inquiryId, async (record, save) => {
      if (record && ['paid', 'awaiting_completion_ack', 'closed'].includes(record.phase)) return view(record);
      requirePhase(record, ['payment_pending', 'payment_unknown']);
      assert(typeof payment?.lookup === 'function', 'payment_adapter_required');
      await permit('reconcile_payment', { payment_intent: paymentIntent(record) });
      try { return await finishPayment(record, await payment.lookup(clone(paymentIntent(record))), await now(), save); }
      catch { record.phase = 'payment_unknown'; record.payment_error = 'reconciliation_unconfirmed'; await save(record); return view(record); }
    });
  }
  async function complete(input) {
    const command = clone(input); shape(command, ['inquiry_id', 'result_digest', 'evidence']);
    assert(id(command.inquiry_id) && hash(command.result_digest) && object(command.evidence), 'invalid_completion');
    return store.transaction(command.inquiry_id, async (record, save) => {
      if (record?.completion && record.completion.payload.result_digest === command.result_digest) return view(record);
      requirePhase(record, ['paid']); const n = await now(); current(record, n);
      const binding = { inquiry_id: command.inquiry_id, result_digest: command.result_digest,
        frozen_digest: digest(record.frozen), payment_digest: digest(record.payment) };
      await permit('complete', { ...binding, evidence: command.evidence });
      assert(typeof completion?.verify === 'function' && await completion.verify(clone(command.evidence), clone(binding)) === true, 'completion_unverified');
      record.completion = await event(record, 'completion', { ...binding, evidence: command.evidence }, n, record.payment);
      record.phase = 'awaiting_completion_ack'; await save(record); return view(record);
    });
  }
  async function close(input) {
    const envelope = clone(input), p = signed(envelope, 'completion_ack');
    return store.transaction(p.inquiry_id, async (record, save) => {
      if (record?.close && digest(record.close) === digest(envelope)) return view(record);
      requirePhase(record, ['awaiting_completion_ack']);
      assert(record.confirmation.status === 'confirmed', 'receipt_unconfirmed');
      validateAck(envelope, record, await now(), 'completion_ack');
      record.close = envelope; record.phase = 'closed'; await save(record); return view(record);
    });
  }
  async function status(inquiryId) { assert(id(inquiryId), 'invalid_inquiry_id'); return view(await store.read(inquiryId)); }
  async function retryNotification(inquiryId) {
    assert(id(inquiryId), 'invalid_inquiry_id');
    return store.transaction(inquiryId, async (record, save) => {
      assert(record, 'inquiry_not_found');
      if (record.notification.status === 'disabled' || record.notification.status === 'sent') return view(record);
      assert(typeof notify === 'function', 'notification_adapter_required');
      let timer;
      try {
        const sent = await Promise.race([
          notify({ type: 'inquiry_recorded', inquiry_id: inquiryId }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 1000); }),
        ]);
        record.notification.status = sent === true ? 'sent' : 'unconfirmed';
      } catch { record.notification.status = 'unconfirmed'; }
      finally { clearTimeout(timer); }
      await save(record); return view(record);
    });
  }
  return Object.freeze({ submit, status, acknowledge, retryReceipt, retryNotification, respond, freeze, pay, reconcilePayment, complete, close });
}
