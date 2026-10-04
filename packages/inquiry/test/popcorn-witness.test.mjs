import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPopcornWitness } from '../src/popcorn-witness.mjs';

test('budget gate precedes witness purchase; adapter does not retry ambiguous purchase', async () => {
  let attempts = 0;
  const config = { nodeId: '767-2676.com', jwks: { keys: [{}] }, verify: async () => { throw Error('not reached'); },
    issue: async () => { attempts++; throw Error('ambiguous'); } };
  const input = { digest: '1'.repeat(64), previous_digest: null };
  await assert.rejects(createPopcornWitness({ ...config, authorizeSpend: async () => false }).commit(input), { code: 'witness_spend_not_authorized' });
  assert.equal(attempts, 0);
  await assert.rejects(createPopcornWitness({ ...config, authorizeSpend: async () => true }).commit(input), /ambiguous/);
  assert.equal(attempts, 1);
});

test('real repository v2 verifier validates saved historical fixture and rejects mutation', { skip: Number(process.versions.node.split('.')[0]) < 24 }, async () => {
  // Node 24 strips types for this repository-local conformance test. The
  // participant runtime itself supports Node 20 with a compiled verifier.
  const { verifyPopcornWitnessEvidence } = await import('../../../verify/typescript/src/v2.ts');
  const vector = JSON.parse(await readFile(new URL('../../../verify/test-vectors/popcorn-witness-receipt-v2.json', import.meta.url), 'utf8'));
  let calls = 0;
  const adapter = createPopcornWitness({ issue: async () => { calls++; }, verify: verifyPopcornWitnessEvidence,
    jwks: { keys: [vector.public_verification_key] }, nodeId: '767-2676.com', authorizeSpend: async () => false });
  const expected = { digest: Buffer.from(vector.submitted_request.payload_digest.value, 'base64url').toString('hex'), previous_digest: null };
  const evidence = { kind: 'popcorn_v2', ...expected, nonce: vector.submitted_request.nonce, response: vector.paid_evidence };
  const result = await adapter.verify(evidence, expected);
  assert.equal(result.valid, true); assert.equal(result.id, vector.paid_evidence.witness_receipt.receipt_id);
  assert.equal(result.lower, vector.paid_evidence.witness_receipt.witness_window_utc.earliest);
  const bad = structuredClone(evidence); bad.response.witness_receipt.node_id = 'impostor.example';
  await assert.rejects(adapter.verify(bad, expected));
  await assert.rejects(adapter.verify(evidence, { ...expected, previous_digest: 'f'.repeat(64) }));
  assert.equal(calls, 0);
});
