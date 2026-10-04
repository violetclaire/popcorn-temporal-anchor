import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createFixture } from './fixture.mjs';
import { createAgent } from '../src/agent.mjs';
import { searchProviders, validateListing } from '../src/discovery.mjs';
import { digest, verifyEnvelope } from '../src/crypto.mjs';

// Runnable two-provider agent flow. All identities, clocks, witness signatures,
// transport and payment/effect records are explicitly SYNTHETIC and local.
const directory = await mkdtemp(join(tmpdir(), 'briarwood-agent-demo-'));
try {
  const f = createFixture(directory), trace = [];
  const search = query => searchProviders(f.listings, query, { trust: f.trust, asOf: f.instant() });
  const inspect = listingId => {
    const listing = f.listings.find(x => x.payload.listing_id === listingId);
    validateListing(listing, { trust: f.trust, asOf: f.instant() });
    return { listing, terms_digest: digest(listing.payload.terms) };
  };
  const buildAgent = participant => createAgent({ participant, search, inspect });
  let agentA = buildAgent(f.participant('provider-a', { deliver: async () => { throw Error('synthetic lost delivery'); } }));
  const agentB = buildAgent(f.participant('provider-b', { payment: {
    ...f.payment, pay: async intent => { await f.payment.pay(intent); throw Error('synthetic lost payment response'); },
  } }));
  let sequence = 0;
  async function call(agent, method, params) {
    const reply = await agent.handle({ id: ++sequence, method, params });
    if (reply.error) throw Error(JSON.stringify(reply.error));
    const r = reply.result;
    trace.push({ method, phase: r.phase ?? 'read', confirmation: r.confirmation?.status ?? null });
    return r;
  }
  const found = await call(agentA, 'providers.search', { query: { capabilities: ['document-review'] } });
  for (const match of found.matches) await call(agentA, 'providers.inspect', { listing_id: match.listing.payload.listing_id });
  await call(agentA, 'inquiry.submit', { envelope: f.inquiry() });
  await call(agentA, 'receipt.retry', { inquiry_id: 'inquiry-1' });
  f.advance(1001);
  agentA = buildAgent(f.participant()); // Reload durable state after failed delivery.
  await call(agentA, 'receipt.retry', { inquiry_id: 'inquiry-1' });
  const referred = await call(agentA, 'inquiry.respond', { inquiry_id: 'inquiry-1', decision: 'refer', referral: {
    destination: f.listings[1], authorization_ref: 'demo-scoped-disclosure', expires_at: f.expiry,
  } });
  await call(agentB, 'inquiry.submit', { envelope: f.inquiry({ provider: 'provider-b', inquiryId: 'inquiry-2', chain: [
    { receipt: referred.receipt, response: referred.response },
  ] }) });
  await call(agentB, 'receipt.retry', { inquiry_id: 'inquiry-2' });
  f.advance(2300);
  let state = await call(agentB, 'inquiry.respond', { inquiry_id: 'inquiry-2', decision: 'accept' });
  state = await call(agentB, 'terms.freeze', { envelope: f.consent('freeze_terms', 'inquiry-2', {
    receipt_digest: digest(state.receipt), response_digest: digest(state.response), terms_digest: state.request.payload.terms_digest,
  }) });
  await call(agentB, 'payment.pay', { inquiry_id: 'inquiry-2' });
  state = await call(agentB, 'payment.reconcile', { inquiry_id: 'inquiry-2' });
  const resultDigest = digest({ result: 'Synthetic structured review completed' });
  state = await call(agentB, 'work.complete', { inquiry_id: 'inquiry-2', result_digest: resultDigest,
    evidence: { type: 'synthetic_result', result_digest: resultDigest } });
  state = await call(agentB, 'work.close', { ack: f.consent('completion_ack', 'inquiry-2', { completion_digest: digest(state.completion) }) });
  for (const envelope of [state.request, state.receipt, state.response, state.freeze_request, state.frozen, state.payment, state.completion, state.close]) verifyEnvelope(envelope, f.trust);
  const report = {
    mode: 'synthetic_local_integration', production_deployed: false, real_payments: 0,
    providers_found: found.matches.length, final_phase: state.phase,
    receipt_acknowledged: state.acknowledgment_confirmed, referral_hops: state.request.payload.referral_chain.length,
    original_receipt_delivery_attempts: referred.confirmation.attempts,
    simulated_provider_payment_attempts: f.counters().payments,
    provider_response_time: state.response_timing, trace,
  };
  if (process.argv[2]) {
    const output = resolve(process.argv[2]); await mkdir(output, { recursive: true });
    await writeFile(join(output, 'agent-inquiry-demo.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(join(output, 'synthetic-exchange.json'), JSON.stringify({ mode: report.mode, trust: f.trust, referred, completed: state }, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally { await rm(directory, { recursive: true, force: true }); }
