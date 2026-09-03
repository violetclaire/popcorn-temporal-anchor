# POPCORN payload-bound witness receipt

## Exact primitive

A POPCORN witness receipt is a signed assertion by one identified POPCORN node
that it received a commitment to exact payload bytes, plus a client nonce and
optional predecessor receipt digest, within a stated UTC interval.

The receipt is designed to be carried by an autonomous agent. The node does not
need the original payload and does not become the agent's memory database.

```text
agent-local payload bytes
        |
        | SHA-256
        v
payload digest + fresh nonce + optional H(previous signed payload bytes)
        |
        | POST /v1/receipt through x402
        v
signed POPCORN witness receipt
        |
        v
agent carries payload + receipt to another session or system
```

The useful product description is:

> POPCORN gives autonomous agents portable, verifiable checkpoints for one
> exact task-state commitment without requiring a shared database.

The word **checkpoint** is essential. The original payload remains the agent's
task state. The receipt makes one exact version of that state tamper-evident,
time-bound, and portable across a trust boundary.

## Live resource

```text
POST https://767-2676.com/v1/receipt
Content-Type: application/json
Payment: x402 v2
```

`GET /v1/time` remains the existing short-lived bearer temporal-anchor service.
`POST /v1/receipt` is additive and payload-bound. Deployments must not silently
change the semantics of `POPCORN/1.0` receipts already in use.

The request is defined by
[`schemas/witness-request.v1.schema.json`](../schemas/witness-request.v1.schema.json):

```json
{
  "payload_digest": {
    "algorithm": "sha-256",
    "value": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  },
  "nonce": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "previous_attestation_digest": null
}
```

Both digest values and the nonce are 32 bytes encoded as unpadded base64url.
POPCORN hashes no ambiguous JSON object. The caller hashes the exact bytes it
intends to carry and later supplies those same bytes to a verifier. If the
payload is JSON, the caller must choose and preserve a deterministic byte
serialization.

When chaining receipts, `previous_attestation_digest` is SHA-256 over the exact
signed payload bytes obtained by base64url-decoding the second segment of the
predecessor compact JWS. It is not a digest of the compact JWS string. `null`
starts a chain.

The response is defined by
[`schemas/witness-response.v1.schema.json`](../schemas/witness-response.v1.schema.json).
Its signed payload uses `protocol_id: POPCORN-WITNESS/1.0`.

The reference HTTP handler must be mounted only after the existing x402 v2
middleware verifies and settles the payment:

```ts
const requestReceivedAtMs = Date.now();
const settlement = await verifyAndSettleX402(request);
if (!settlement.ok) return settlement.response;

return handlePaidWitnessRequest(request, {
  request_received_at_ms: requestReceivedAtMs,
  receipt_id: crypto.randomUUID(),
  signing_key: witnessSigningKey,
  signing_key_id: publishedKeyId,
  clock_accuracy_radius_ms: publishedClockRadiusMs,
  payment_identifier: settlement.identifier,
  payment_transaction: settlement.transaction,
});
```

`verifyAndSettleX402` is an integration placeholder here, not a second payment
implementation. Production must reuse the node's existing reviewed x402 path
and preserve its settlement and replay handling.

## What verification establishes

Given the original payload bytes, original nonce, accepted POPCORN public key,
and receipt, an offline verifier can establish that:

- the receipt signature is valid under the selected POPCORN key;
- the signed receipt exactly matches the JWS payload;
- the payload digest matches the bytes supplied by the verifier;
- the signed nonce matches the nonce expected for that request;
- the signed time relationships and accuracy interval are internally valid;
- when present, the predecessor receipt verifies and its exact signed-payload
  digest matches the commitment.

This supports three higher-level patterns, but does not implement their local
policy:

### Portable state checkpoint

The agent stores or transports its payload and receipt together. Another
session or system can verify that the payload is the same version the POPCORN
node witnessed. The receipt alone cannot reconstruct, retrieve, or interpret
the payload.

### Replay-aware consumption

The nonce binds the receipt to a particular request. The verifier returns a
stable `replay_key`, but the consuming system must remember which replay keys,
action IDs, or idempotency keys it has already accepted. POPCORN does not claim
that signing a nonce prevents an action from being replayed.

The signed scope therefore says:

```text
nonce_uniqueness_enforced = false
replay_prevented = false
```

### Causal checkpoint chain

To create checkpoint `B` after checkpoint `A`, compute SHA-256 over the exact
UTF-8 bytes of `A.witness_attestation.compact_jws` and send that digest as
`previous_attestation_digest` in the request for `B`.

If `A` independently verifies and its exact compact-JWS digest matches the
value signed into `B`, then `B` is cryptographically bound to that specific
earlier attestation. Under SHA-256 preimage and collision resistance, the
signed bytes of `A` existed before the request for `B` was constructed. This
does not prove that the requester authored or understood `A`, or that either
described action executed in the physical world.

## What the receipt does not prove

The signed scope deliberately records the negative boundary:

```text
payload_disclosed = false
caller_identity_proven = false
recipient_delivery_proven = false
action_execution_proven = false
nonce_uniqueness_enforced = false
replay_prevented = false
authorization_granted = false
```

Consequences:

- The node witnesses a digest, not the underlying payload.
- A receipt does not identify who authored or submitted the payload. Actor
  attribution requires the actor to sign the original payload separately.
- A receipt does not prove dispatch to or receipt by an intended destination.
  Delivery requires a recipient acknowledgment.
- A receipt does not prove execution, completion, truth, legality, permission,
  or successful coordination.
- A receipt is evidence used by participant-local policy; it is never a
  command or authorization.

## Time trust and accuracy

Cryptography makes the statement attributable and tamper-evident. It does not
make a compromised signing key or inaccurate clock truthful.

Every issuer must configure and defend `clock_accuracy_radius_ms`. The signed
`witness_window_utc` is derived as:

```text
earliest = witnessed_at_utc - clock_accuracy_radius_ms
latest   = witnessed_at_utc + clock_accuracy_radius_ms
```

Verifiers should compare deadlines against the entire interval, not the number
of decimal places printed in a timestamp. A deployment must publish its clock
source, synchronization policy, accuracy basis, key-rotation policy, and
incident procedure before describing itself as a neutral or trusted witness.

## Privacy boundary

The service accepts only a digest, nonce, and optional predecessor digest. The
original memory, task content, schedule, identity, and receiving-party state
remain participant-local. Operators must not add payload logging to the
reference flow merely because an application happens to possess the payload.

## Production status

The schemas, issuer, offline verifiers, and shared signed vector in this
repository define the contract. The paid `POST /v1/receipt` route, separate
witness verification key, x402 settlement path, and declared clock policy are
live. One real `$0.001` USDC mainnet payment produced the public evaluation
packet in [`examples/witness`](../examples/witness), which independently passes
the JavaScript and Python verifiers and rejects the one-byte tamper case.
