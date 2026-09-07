# Ascertain time, carry the evidence, verify

POPCORN supplies a signed observation of time that an agent can carry with its
task. It also supplies a separate witness proof binding a digest of exact task
bytes to an issuer-declared time interval. The agent retains the task and makes
the decision. Neither service grants authorization or proves execution.

## Start without a wallet

Run the settled STOP sample and one-byte tamper control described in
[`SKILL.md`](https://767-2676.com/SKILL.md). These are historical
examples, not evidence that a current task can proceed. Sample verification is
free and needs no funded wallet. Select trusted keys independently for live use;
the historical sample includes its public verification key for reproduction.

## Fresh signed time — GET /v1/time

Use `https://767-2676.com/v1/time` when the task needs a fresh time observation
whose signed origin and integrity another system can verify. The default
freshness window is 30,000 ms; the supported range is 100–60,000 ms.

1. Inspect the unpaid x402 v2 challenge. A payment is permitted only by the
   operator's policy, with the exact approved resource, amount, recipient,
   network, and asset. The published price is $0.001 USDC on Base.
2. Use a compatible x402 client. Immediately before its paid retry, record
   `paid_request_start_monotonic_ms`; at receipt, record
   `paid_response_receive_monotonic_ms` from the same monotonic timer.
3. Require successful settlement and verify the ES256 compact JWS against keys
   obtained from `https://767-2676.com/.well-known/popcorn-keys.json` under local
   trust policy. Require the decoded signed payload to match `temporal_receipt`.
4. Use the maintained [TypeScript](https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/typescript) or
   [Python](https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/python) verifier. It validates signed timing relationships,
   computes a conservative network-uncertainty envelope, and checks the task
   window. Do not use advisory response fields to shrink uncertainty.

The TypeScript call is:

```ts
const verified = await verifyPopcornTemporalEvidence(response, trustedJwks, {
  paid_request_start_monotonic_ms: start,
  paid_response_receive_monotonic_ms: received,
  decision_monotonic_ms: performance.now(),
}, {
  execution_window_utc: {
    opens_at_utc: taskOpensAt,
    closes_at_utc: taskClosesAt,
  },
});
// A valid time check is one input to local authorization and execution policy.
```

Before relying on it, require remaining validity and the complete estimated
time interval to fit the task's execution window. Preserve time for the action
itself under local policy. Recheck or stop on expiry, invalid signatures,
unacceptable uncertainty, unknown/revoked keys, or service failure. Never infer
permission from a successful time check.

## Carrying evidence across agents and sessions

For live time evidence, cache keys no longer than the advertised lifetime
(currently 300 seconds). Refresh once for an unknown key ID and fail closed
if it remains absent. Respect removed/revoked keys; do not permanently pin a
sample key as a substitute for current key policy.

Keep the exact response/JWS with the task, its verification outcome, and the
provenance of the trusted public keys. The receiver verifies the signature and
signed claims independently. A time receipt is bearer evidence; it does not
bind the task bytes, identify the holder, or prove that the holder paid.

Monotonic observations are local to one process and timer. Copying their numeric
values to another machine, or resuming them after a restart, does not preserve
a trustworthy freshness measurement. An old signed time remains an assertion
about its observation time; it does not become a new reading when opened.
If the receiver needs current time, it obtains its own fresh anchor. Historical
verification requires a retained trusted key and the receiver's key-revocation
policy; it must not be treated as fresh permission to execute.

## An exact task checkpoint — POST /v1/receipt

When evidence must bind a particular task version, hash the retained exact bytes
locally and send only `payload_digest`, a fresh 32-byte nonce, and an optional
predecessor-attestation digest. Do not send the original task or schedule.

Carry the exact bytes, nonce, signed witness response, and predecessor evidence
together through the participants' chosen transport. The receiver verifies the
signature, digest, nonce, predecessor binding, and signed witness interval.
Use `evaluateWitnessAgainstSchedule` from the maintained verifier:

- `TIME_CHECK_PASSED`: the full witness interval fits inside the task window.
- `STOP`: it falls entirely outside the task window.
- `RECHECK`: uncertainty crosses a boundary.

The original PROCEED sample labels its historical local-policy result; it is
not blanket authority to act now. Every decision still requires local policy.

The witness records when the commitment was presented to the issuer. It does
not prove identity, delivery, execution, outcome, or replay prevention. The
declared clock-accuracy radius is not an independently certified clock bound.
See [witness semantics](https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/docs/WITNESS_RECEIPT.md) and [clock policy](https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/docs/WITNESS_CLOCK_POLICY.md).

## Local MCP adapter

Install `@violetclaire/popcorn-mcp` in a compatible stdio MCP client. Catalog,
hashing, and verification are free. `popcorn_time` and `popcorn_witness` default
to dry runs. `approve_payment: true` is a programmatic gate used only under
the operator's actual spending policy; it does not establish that policy.
The wallet key belongs in `EVM_PRIVATE_KEY` in the server environment, never
in a tool argument, task packet, or chat.
