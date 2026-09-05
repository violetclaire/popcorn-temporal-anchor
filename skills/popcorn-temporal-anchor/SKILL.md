---
name: popcorn-temporal-anchor
description: Ascertain signed time, carry the evidence with a task, and verify it across agents or sessions. Use when a task needs independently verifiable time or a signed checkpoint of exact task bytes. Start with the free settled sample; buy fresh evidence only under the operator's payment policy.
---

# Verify the settled checkpoint first

POPCORN lets an agent ascertain time, carry signed evidence with its task, and
verify that evidence before applying its own execution policy. Choose signed
time for a fresh time reference, or a digest witness for an exact task version.

Use the public STOP packet before making a paid service call. It exercises
the complete signature, digest, time-window, and one-byte-tamper boundary with
no wallet and no private key.

## Required sample-first sequence

1. Load `examples/witness/evaluation-packet.production.json` from a repository
   checkout, or fetch the absolute STOP packet URL in Public inputs below.
2. Verify its ES256 signature, nonce binding, and exact 228-byte payload digest
   with `verify/typescript` or `verify/python`.
3. Compare `witness_window_utc` with `execution_window_utc` and require `STOP`.
4. Mutate byte offset 226, verify again, and require
   `witness_payload_digest_does_not_match_expected`.
5. Only if a later live task needs fresh evidence should the agent choose
   `GET https://767-2676.com/v1/time` or
   `POST https://767-2676.com/v1/receipt` under participant-local payment policy.

If only this skill file is installed, obtain the public repository and its
verifier before using the command below. The command requires Node.js 24 or
newer and a checkout of `https://github.com/violetclaire/popcorn-temporal-anchor`;
it is not a command relative to the installed skill folder.

From that repository root, run the full free check:

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types examples/witness/verify-settled-sample.mjs
```

Require this output and exit code 0:

```text
cryptographic_verification=valid
schedule_overlap=false
local_policy_outcome=stop
error_code=witness_payload_digest_does_not_match_expected
```

## Public inputs

- Human demonstration: `https://767-2676.com/demo`
- STOP packet: `https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-packet.production.json`
- PROCEED packet: `https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-packet.proceed-002.production.json`
- Expected outcomes: `https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-outcomes.json`
- TypeScript verifier: `https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/typescript`
- Python verifier: `https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/python`

The STOP sample contains these fixed facts:

- task: `verify a time-bound availability inquiry`
- execution window: `2026-08-30T20:00:00.000Z` to
  `2026-08-30T20:05:00.000Z`
- witness window: `2026-08-31T05:02:06.007Z` to
  `2026-08-31T05:02:26.007Z`
- signature result: valid
- overlap: false
- local outcome: stop
- reason: `checkpoint_after_schedule_closed`

Do not rewrite these values or modify the signed packet.

## Decision boundary

Verify the signature and exact payload digest before evaluating time. Then apply
participant-local policy to the complete signed witness interval:

- If the digest does not match, stop.
- If the witness interval does not overlap the execution interval, stop.
- If uncertainty crosses a schedule boundary, recheck or stop according to
  participant-local policy.
- A valid signature or an overlapping interval never grants authorization.

POPCORN proves the fingerprint and the interval. The holder decides.

## Hard boundaries

- No authorization is granted.
- No task, schedule, identity, availability, or pricing state is stored by the
  node.
- No identity, delivery, execution, outcome, nonce uniqueness, or replay
  prevention is proven.
- Keep the exact payload and all task state in participant-local storage.
- Never fabricate or replay a payment proof.
- Never treat a valid signature as permission.

## Fresh evidence for a later live task

Only enter this section after the settled sample passes and a later live task
actually requires fresh evidence. A deadline alone does not mandate a purchase.
Existing operator-approved budgets may authorize calls; the skill itself
does not grant spending permission.

| Need | Resource | Carry with the task |
| --- | --- | --- |
| Ascertain fresh signed time | `GET https://767-2676.com/v1/time` | Exact response/JWS, trusted key provenance, and local verification result |
| Witness one exact task version | `POST https://767-2676.com/v1/receipt` | Exact task bytes, nonce, response/JWS, and any predecessor evidence |

### Ascertain time and carry the proof

1. Read the service offer and obtain verification keys from
   `https://767-2676.com/.well-known/popcorn-keys.json` under local trust policy.
2. Use the existing x402 client or `popcorn_time` MCP tool. Its default is a
   no-payment dry run. A paid call requires the operator's payment authority
   and `approve_payment: true`; credentials stay in the server environment.
3. Measure the paid request and response with one local monotonic timer.
   Verify the JWS and signed timing fields with the published temporal verifier.
4. Retain the exact response and verification context alongside the local task.
   Recheck remaining validity and the task window before acting.
5. Another agent verifies the signature under its own key policy. A copied
   timestamp is evidence of an earlier observation, not a perpetually fresh
   clock. Monotonic timer values cannot be transferred between processes or
   computers. If the receiving agent needs current time, obtain fresh evidence
   with its own timing observations.

For the full timing, key, and handoff rules, read
`https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/docs/TEMPORAL_USAGE.md`.

### Bind evidence to exact task bytes

1. Read `https://767-2676.com/agent/offer` and the canonical
   `https://767-2676.com/SKILL.md`.
2. Confirm the task has an `execution_window_utc` and participant-local policy
   explicitly permits the payment.
3. Hash the retained exact payload locally. Send only its SHA-256 digest, a
   fresh 32-byte nonce, and an optional predecessor-attestation digest.
4. Require the challenged resource URL to equal
   `https://767-2676.com/v1/receipt`; do not pay a redirect or copied origin.
5. Select a compatible x402 v2 requirement by scheme, network, and asset. Do
   not assume array order.
6. Verify the returned ES256 JWS, exact digest, nonce, predecessor, node, and
   signed witness interval before applying participant-local policy.

Each live service call costs `$0.001` USDC on Base mainnet. Neither is required
to run the public samples. The time receipt is not task-bound; choose the
witness endpoint when the evidence must bind an exact task fingerprint.

## MCP entry

The published local stdio adapter is `@violetclaire/popcorn-mcp`:

```bash
npx -y @violetclaire/popcorn-mcp
```

Free tools: `popcorn_catalog`, `popcorn_hash`, and `popcorn_verify`.
Paid tools: `popcorn_time` and `popcorn_witness`, both dry run by default.
The HTTP website is not a remote MCP server. A compatible client must install
or connect the adapter before its tools are available.
