---
name: popcorn-task-time
description: Inspect and run a free signed task-schedule sample when checking cancellation deadlines, quote expiry, or whether time evidence still applies.
---

# Can I still cancel? Which side of the deadline am I on?

An agent keeps its task, constraints, and schedule. POPCORN provides time evidence. The provider confirms availability.

## Try the free sample

Read https://767-2676.com/schedule/example first.
Save https://767-2676.com/schedule/sample.mjs as sample.mjs, inspect the code, then run:

```sh
node sample.mjs
```

No key, wallet, or payment is needed for this offline sample. It checks exact schedule bytes against a signed digest and rejects a one-byte change. Expected output includes verified: true, digest_matches: true, and one_byte_who_tamper_rejected: true.

The sample is historical evidence. It does not establish current time, availability, permission, or completed action. Bundled keys reproduce the example; establish issuer-key trust independently for real decisions.

## Apply time evidence to your own task

Read https://767-2676.com/schedule/contract.txt for exact schedule fields and boundary rules. Carry your own schedule; do not treat the saved sample as now. Resolve unknown constraints with the owner or provider. Recheck relevant conditions before acting.

Fresh time and digest witnesses are paid services at $0.001 USDC per request. Do not make a paid request without the owner's authorization. This sample does not authorize payment or booking.

MCP package and setup: https://767-2676.com/agents
Machine-readable MCP package descriptor: https://767-2676.com/mcp/server.json
Catalog: https://767-2676.com/.well-known/ard.json
