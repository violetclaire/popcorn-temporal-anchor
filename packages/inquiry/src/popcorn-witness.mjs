import { randomBytes } from 'node:crypto';
import { canonical } from './crypto.mjs';
import { assert, hash, interval, shape } from './rules.mjs';

/** Bridge to the existing POPCORN v2 client and independent verifier.
 * `issue` is popcornWitness from @violetclaire/popcorn-mcp/core.
 * `verify` is verifyPopcornWitnessEvidence from verify/typescript/src/v2.
 * The operator supplies pinned JWKS and a budget/authority gate. No call on
 * construction and no implicit retry of an uncertain paid request.
 */
export function createPopcornWitness({ issue, verify, jwks, nodeId, authorizeSpend } = {}) {
  assert(typeof issue === 'function' && typeof verify === 'function' &&
    typeof authorizeSpend === 'function' && typeof nodeId === 'string' && nodeId.length > 0, 'witness_configuration_required');
  const keys = JSON.parse(canonical(jwks));
  assert(Array.isArray(keys.keys) && keys.keys.length > 0, 'witness_keys_required');
  const encoded = value => Buffer.from(value, 'hex').toString('base64url');
  function binding(input) {
    shape(input, ['digest', 'previous_digest']);
    assert(hash(input.digest) && (input.previous_digest === null || hash(input.previous_digest)), 'invalid_witness_binding');
    return JSON.parse(canonical(input));
  }
  async function check(evidence, expected) {
    const wanted = binding(expected);
    shape(evidence, ['kind', 'digest', 'previous_digest', 'nonce', 'response']);
    assert(evidence.kind === 'popcorn_v2' && evidence.digest === wanted.digest &&
      evidence.previous_digest === wanted.previous_digest &&
      evidence.response?.witness_receipt?.protocol_id === 'POPCORN-WITNESS/2.0', 'witness_binding_mismatch');
    const verified = await verify(evidence.response, keys, {
      expected_node_id: nodeId, expected_nonce: evidence.nonce,
      expected_payload_digest: encoded(wanted.digest),
    });
    assert(verified.signature_verified === true && verified.payload_digest_verified === true &&
      verified.nonce_verified === true && verified.witness_receipt.commitment.previous_attestation_digest === null,
    'witness_invalid');
    const result = { valid: true, ...wanted, id: verified.witness_receipt.receipt_id,
      lower: verified.witness_window_utc.earliest, upper: verified.witness_window_utc.latest };
    interval(result); return result;
  }
  async function commit(input) {
    const wanted = binding(input);
    assert(await authorizeSpend({ purpose: 'inquiry_temporal_witness', node_id: nodeId, ...wanted }) === true, 'witness_spend_not_authorized');
    const nonce = randomBytes(32).toString('base64url');
    const paid = await issue({ digest: encoded(wanted.digest), nonce, previous_attestation_digest: null, approve_payment: true });
    assert(paid?.payment_sent === true && paid.response?.witness_receipt && paid.response?.witness_attestation, 'witness_purchase_unconfirmed');
    // Retain signed data, not optional QR artwork or transport/payment headers.
    const evidence = { kind: 'popcorn_v2', ...wanted, nonce, response: {
      witness_receipt: paid.response.witness_receipt,
      witness_attestation: paid.response.witness_attestation,
      payment_status: paid.response.payment_status,
    } };
    await check(evidence, wanted);
    return JSON.parse(canonical(evidence));
  }
  return Object.freeze({ commit, verify: check });
}
