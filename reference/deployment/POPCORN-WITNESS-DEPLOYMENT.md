# Production deployment gate for `POST /v1/receipt`

The repository contract is live on the canonical node. This document preserves
the production gate that was completed before public discovery was enabled.

## Production acceptance evidence

- Controlled deployment returned the exact `$0.001` USDC Base x402 challenge.
- One real paid request settled and returned HTTP `200`.
- Base transaction: `0x8dfce272b223179adc3b68256ebf03a27721fb7b708c0e50f47753e6c33bab0c`.
- Receipt ID: `pwr_24a140e0651c67375cdfb34bc1c38b47`.
- JavaScript and independent Python verification passed for the exact bytes.
- A one-byte payload change failed with
  `witness_payload_digest_does_not_match_expected`.
- Public evidence: `examples/witness/evaluation-packet.production.json`.

## Route and payment

- Add path-only `POST /v1/receipt`; do not overload or change `GET /v1/time`.
- Accept only `application/json` and a maximum 4 KiB request body.
- Reuse the production x402 v2 exact-scheme verification and settlement path.
- Challenge the exact canonical resource URL
  `https://767-2676.com/v1/receipt`.
- Keep the intended toll at `$0.001` USDC on Base only if that is what the live
  `PAYMENT-REQUIRED` challenge actually advertises.
- Invoke `handlePaidWitnessRequest` only after settlement succeeds.
- Preserve x402 payment replay handling independently of application replay
  policy.

## Signing and time policy

- Use a non-extractable production ES256 key; never deploy the reference-vector
  key or include private JWK material in source.
- Publish the active public key and `kid` in
  `/.well-known/popcorn-keys.json` before returning receipts that use it.
- Configure `clock_accuracy_radius_ms` from a documented, defensible clock
  policy. Do not infer accuracy from fractional timestamp digits.
- Publish clock source, synchronization, monitoring, incident, key-rotation,
  and historical-verification policy.
- Reject issuance when the signing key or configured clock policy is
  unavailable.

## Privacy and state

- Parse only `payload_digest`, `nonce`, and `previous_attestation_digest`.
- Reject unknown properties, including any attempted raw payload field.
- Do not log request bodies, payload digests, nonces, compact JWS values, or
  payment proofs in ordinary application logs.
- Do not store checkpoint payloads or silently turn the witness endpoint into
  a memory database.
- The endpoint may remain stateless after settlement; the caller carries the
  payload and receipt.

## Discovery changes after successful deployment

Update all surfaces atomically so agents see one consistent contract:

- `/agents`
- `/agent/offer`
- `/SKILL.md`
- `/llms.txt`
- `/.well-known/agent.json`
- `/openapi.json`
- response `Link` headers
- x402 Bazaar extension metadata
- `/agent/status`

Publish these schemas at their canonical paths:

- `/schemas/witness-request.v1.json`
- `/schemas/witness-response.v1.json`

Discovery language must call the receipt a **portable, verifiable memory
checkpoint**, not memory storage. It must retain the exact negative proof
boundary from `docs/WITNESS_RECEIPT.md`.

## Acceptance tests

1. An unpaid request returns `402` with the exact canonical resource URL,
   method `POST`, JSON input schema, amount, asset, network, and payee.
2. A paid request returns `200`, `PAYMENT-RESPONSE`, and
   `X-POPCORN-Protocol: POPCORN-WITNESS/1.0`.
3. Both public verifiers accept the returned receipt using the original local
   payload and nonce.
4. Either verifier rejects a changed payload, changed nonce, changed
   predecessor, altered scope, unknown `kid`, or invalid time relationship.
5. After independently verifying a first receipt, a second receipt containing
   `H(first compact JWS)` matches those exact predecessor bytes.
6. A consumer that records `replay_key` rejects its second application even
   though the POPCORN node remains stateless.
7. A repository scan and production-log review find no private signing key,
   raw payload, wallet secret, or reusable payment proof.
8. `GET /v1/time` continues to pass its existing conformance tests unchanged.

## Release sequence

1. Deploy the route and schemas without adding it to public discovery.
2. Make one controlled paid request and verify it independently in TypeScript
   and Python.
3. Exercise the chained-receipt and negative tests.
4. Update discovery surfaces and node version together.
5. Probe the public challenge and paid response from a clean client.
6. Only then change `service_state` from
   `implementation_ready_not_live` to `available`.
