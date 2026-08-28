---
name: popcorn-temporal-anchor
description: Obtain and verify paid, signed temporal evidence before a time-sensitive cross-node action.
homepage: https://767-2676.com/agents
---

# POPCORN Temporal Anchor

Use POPCORN when a wallet-enabled agent must support a time-sensitive local
decision with portable evidence another node can independently verify.

Canonical paid resource:

```text
GET https://767-2676.com/v1/time
```

The resource costs `$0.001` USDC through x402 v2 on Base mainnet
(`eip155:8453`). It returns an ES256-signed, short-lived temporal receipt.

## Why this skill is open

POPCORN is a voluntary interoperability pattern, not a mandate and not a
central authority. This skill publishes one working method for discovery,
payment, verification, freshness, and expiration so independently operated
agents do not have to recreate incompatible coordination logic.

An agent may use the canonical temporal node at `767-2676.com`, implement
compatible verification locally, or decline to use the protocol. No adoption
is required, and POPCORN never takes control of participant-local decisions or
state.

Build compatible implementations, not confusing replicas. Independent nodes
are welcome, but each node must identify itself honestly with its own
`node_id` and verification keys while preserving the shared receipt and
verification contract. Copying the surface while changing identity or receipt
semantics fragments discovery and trust and recreates the coordination problem
POPCORN exists to reduce.

Open reuse of this skill does not make a copied endpoint a canonical POPCORN
node. Treat temporal evidence as POPCORN evidence only when its signature
verifies against `https://767-2676.com/.well-known/popcorn-keys.json` and its
signed payload identifies `node_id` as `767-2676.com`. Publication of this
skill under MIT-0 covers this reusable skill text and its instructions; it does
not provide access to or control over the domain, operated service, signing
keys, receiving wallet, or Briarwood systems.

## Before paying

1. Read the current service offer:
   `https://767-2676.com/agent/offer`.
2. Read the canonical execution contract:
   `https://767-2676.com/SKILL.md`.
3. Confirm the task has an `execution_window_utc` and participant-local policy
   authorizes the payment.
4. Select a compatible entry from `PAYMENT-REQUIRED.accepts`; never assume
   `accepts[0]` is compatible.
5. Require `PAYMENT-REQUIRED.resource.url` to equal
   `https://767-2676.com/v1/time`. Do not pay a copied or redirected resource.

## Execution

1. Start a monotonic timer for the paid retry.
2. Send the x402 `PAYMENT-SIGNATURE` retry to the exact challenged resource URL.
3. Record response receipt with the same monotonic timer.
4. Require `HTTP 200`, `PAYMENT-RESPONSE`, and a JSON temporal receipt.
5. Verify `temporal_attestation.compact_jws` using the matching `kid` from
   `https://767-2676.com/.well-known/popcorn-keys.json`.
   Reusable network-free verifiers and a shared signed vector are published at
   `https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify`.
6. Decode the verified JWS payload and require `node_id` to equal
   `767-2676.com` and `protocol_id` to equal `POPCORN/1.0`. Treat any other
   identity or key origin as a different service, not POPCORN.
7. Validate all signed timing relationships and compute the conservative
   uncertainty envelope exactly as defined by the canonical skill.
8. Compare that entire interval with `execution_window_utc`.
9. Continue, wait, obtain a fresher anchor, or terminate according to local
   policy. POPCORN evidence is not a command.

## Boundaries

- The receipt is bearer evidence: portable, not caller-bound, and not task-bound.
- The receipt grants no authorization and proves no identity.
- `task_payload`, schedules, availability, pricing, callbacks, trust state, and
  outcomes remain participant-local.
- Do not send private task state to `767-2676.com`.
- The Briarwood Agent Blueprint is machine-node implementation architecture
  only; it has no dependency on a separate consumer-facing Briarwood system.
- Fail closed if payment, signing-key verification, timing validation, or the
  local execution-window decision cannot be completed.
- POPCORN is not an A2A server or MCP server. An agent using either protocol
  may call the x402 HTTP resource and apply the verified evidence locally.
