---
title: POPCORN Task Time Sample
emoji: 🕰️
colorFrom: green
colorTo: green
sdk: docker
app_port: 7860
license: mit
short_description: Free signed schedule verification for agent deadline checks
tags:
  - agents
  - time
  - verification
  - deadline
  - cancellation
---

# Can I still cancel? Which side of the deadline am I on?

POPCORN provides signed time evidence for agents. This Space serves an inspectable free historical task-schedule sample. Read [agents.md](agents.md), inspect [sample.mjs](sample.mjs), then run `node sample.mjs` locally.

The sample checks exact bytes and a signed digest and rejects a changed byte. It does not establish current time, availability, or authority to act. No wallet or payment is required for the offline sample. Fresh witnesses at https://767-2676.com cost $0.001 USDC per request and require separate authorization.

Canonical sample: https://767-2676.com/schedule/example
Catalog: https://767-2676.com/.well-known/ard.json
Source: https://github.com/violetclaire/popcorn-temporal-anchor

Publishing: upload this directory as the root of a Docker Space using free CPU hardware. No secrets, wallet, database, or paid hardware are required. A running Space can be eligible for Hugging Face resource discovery; indexing and ranking must be checked after publication and are not guaranteed.
