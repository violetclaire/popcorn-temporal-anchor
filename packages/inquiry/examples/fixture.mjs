// Synthetic adapters only. These keys, times and settlement records are NOT
// POPCORN evidence, live participant identity or blockchain settlement.
import { generateKeyPairSync } from 'node:crypto';
import { join } from 'node:path';
import { createParticipant } from '../src/participant.mjs';
import { signEnvelope, verifyEnvelope, digest } from '../src/crypto.mjs';
import { PROTOCOL } from '../src/rules.mjs';

export function createFixture(directory, { amount = '1000' } = {}) {
  const identities = {}, trust = {};
  for (const id of ['requester', 'provider-a', 'provider-b', 'test-witness']) {
    const pair = generateKeyPairSync('ed25519');
    identities[id] = { id, kid: id + '-key', privateKey: pair.privateKey };
    trust[id] = { keys: { [id + '-key']: pair.publicKey.export({ format: 'jwk' }) }, endpoints: [`https://${id}.example/inquiry`, `https://${id}.example/ack`] };
  }
  let tick = Date.parse('2026-10-03T12:00:00Z'), witnessCount = 0, payments = 0;
  const expiry = '2026-10-04T12:00:00.000Z';
  const instant = () => new Date(tick).toISOString();
  const clock = async () => ({ lower: instant(), upper: instant() });
  const signed = (payload, issuer = 'requester') => signEnvelope(payload, identities[issuer]);
  const listing = issuer => signed({
    protocol: 'BRIARWOOD-LISTING/1', type: 'listing', issuer, listing_id: issuer + '-document-review',
    issued_at: '2026-10-03T00:00:00.000Z', expires_at: expiry,
    subject: 'Structured document review', capabilities: ['document-review'], conditions: ['Plain text input'],
    inquiry_endpoint: `https://${issuer}.example/inquiry`,
    terms: { version: '1', summary: 'Return a structured document review.',
      price: { amount_atomic: amount, currency: 'TEST', network: 'synthetic', payee: issuer }, constraints: ['No publication'] },
    response_within_ms: 60_000,
  }, issuer);
  const listings = [listing('provider-a'), listing('provider-b')];
  const witness = {
    async commit(binding) {
      witnessCount++;
      return signed({ ...binding, issuer: 'test-witness', type: 'synthetic_witness', id: 'witness-' + witnessCount,
        lower: instant(), upper: instant() }, 'test-witness');
    },
    async verify(evidence, expected) {
      try {
        const p = verifyEnvelope(evidence, trust);
        return { valid: p.issuer === 'test-witness' && p.type === 'synthetic_witness' && p.digest === expected.digest && p.previous_digest === expected.previous_digest,
          digest: p.digest, previous_digest: p.previous_digest, id: p.id, lower: p.lower, upper: p.upper };
      } catch { return { valid: false }; }
    },
  };
  const settlements = new Map();
  const payment = {
    async pay(intent) {
      payments++;
      const evidence = { type: 'synthetic_settlement', payment_id: 'test-payment-' + payments, intent_digest: digest(intent) };
      settlements.set(intent.idempotency_key, evidence); return evidence;
    },
    async lookup(intent) { return settlements.get(intent.idempotency_key) ?? null; },
    async verify(evidence, intent) {
      return !!evidence && evidence.type === 'synthetic_settlement' &&
        evidence.intent_digest === digest(intent) && digest(evidence) === digest(settlements.get(intent.idempotency_key));
    },
  };
  const consent = (type, inquiry_id, bindings) => signed({
    protocol: PROTOCOL, type, issuer: 'requester', inquiry_id, issued_at: instant(), expires_at: expiry, ...bindings,
  });
  function inquiry({ provider = 'provider-a', inquiryId = 'inquiry-1', chain = [], need = 'Review the attached local text.' } = {}) {
    const offer = listings.find(l => l.payload.issuer === provider);
    return consent('inquiry', inquiryId, {
      provider_id: provider, listing_digest: digest(offer), terms_digest: digest(offer.payload.terms),
      capability: 'document-review', need, reply_endpoint: 'https://requester.example/ack', referral_chain: chain,
    });
  }
  const ack = receipt => consent('receipt_ack', receipt.payload.inquiry_id, { receipt_digest: digest(receipt) });
  function participant(provider = 'provider-a', overrides = {}) {
    return createParticipant({ identity: identities[provider], trust, listings, storeDir: join(directory, provider),
      clock, witness, authorize: async () => true,
      deliver: async ({ receipt }) => ack(receipt), payment,
      completion: { verify: async (evidence, binding) => evidence.type === 'synthetic_result' && evidence.result_digest === binding.result_digest },
      ...overrides });
  }
  return { identities, trust, listings, witness, payment, clock, participant, inquiry, signed, consent, ack, expiry, instant,
    advance: ms => { tick += ms; }, counters: () => ({ witnesses: witnessCount, payments }) };
}
