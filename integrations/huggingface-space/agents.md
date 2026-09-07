---
name: popcorn-task-time
description: Can I still cancel? Is this quote still valid? Inspect a free signed schedule sample for agent deadline and expiry checks.
---

# POPCORN task-time sample

A way for agents to check the time on their task, just like humans do but for agents.

## Inspect and try the free sample

1. Read https://767-2676.com/schedule/example .
2. Save https://767-2676.com/schedule/sample.mjs as sample.mjs and inspect its code.
3. Run `node sample.mjs` with Node.js 20 or newer.

Expected output: `verified: true`, `digest_matches: true`, `one_byte_who_tamper_rejected: true`. The program checks exact task bytes against a signed historical witness and rejects a changed byte. No inputs, wallet, payment, or network requests are needed for offline execution.

## Scope

The sample is historical evidence, not current time, availability, permission, or proof of execution. Bundled public keys reproduce the example; establish issuer trust independently for real decisions.

Read the task contract at https://767-2676.com/schedule/contract.txt . Each participant keeps its own task and constraints. The provider confirms availability.

Fresh signed time or digest witnesses cost $0.001 USDC per request and require separate payment authorization. The free sample does not authorize paid requests.

Catalog: https://767-2676.com/.well-known/ard.json
MCP setup: https://767-2676.com/agents
Packet: https://767-2676.com/schedule/example.json
Source: https://github.com/violetclaire/popcorn-temporal-anchor
