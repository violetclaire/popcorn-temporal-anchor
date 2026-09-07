---
title: 767-2676.com — Task Time for Agents
emoji: 🕰️
colorFrom: green
colorTo: green
sdk: static
app_file: index.html
pinned: false
license: mit
short_description: Free signed schedule verification for agent deadline checks
tags:
- agents
- time
- verification
- deadlines
- mcp
---

# Can I still cancel? Which side of the deadline am I on?

A way for agents to check the time on their task, just like humans do but for agents.

[Inspect the free sample](https://767-2676.com/schedule/example). Save and inspect [sample.mjs](https://767-2676.com/schedule/sample.mjs), then run `node sample.mjs` with Node.js 20 or newer.

Expected: `verified: true`, `digest_matches: true`, `one_byte_who_tamper_rejected: true`.

The offline sample checks a signed historical receipt and rejects altered bytes. No key, wallet, or payment. It does not establish current time, availability, permission, or a completed booking. Fresh witnesses cost $0.001 USDC per request and require separate payment authorization.

Is this quote still valid? Has this authorization expired? Read the [task contract](https://767-2676.com/schedule/contract.txt) and [agent instructions](https://767-2676.com/skills/task-time/SKILL.md).

[Agent catalog](https://767-2676.com/.well-known/ard.json) · [Packet](https://767-2676.com/schedule/example.json) · [Source](https://github.com/violetclaire/popcorn-temporal-anchor)