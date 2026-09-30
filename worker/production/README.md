# POPCORN Worker production-source export

This directory records the exact four-module Worker source approved and deployed at
2026-09-30T03:59:52Z. Post-deployment verification observed active version
`4844160f-6848-423e-8528-a8bc96a8d6cf`, `index.js` SHA-256
`20fa01bcd63e4b4bd48ce47cfebb0090f703156beea3001b7ee6c9996b018adb`,
and settings SHA-256 `7066230a6e15b99dcd99b97dced1deb038c2ffca2ac0b65540d4b2ac159da7a0`.
The three imported modules match the verified deployed bytes. This export contains
no secret binding values and this repository change does not deploy a Worker.

The first line of `index.js` carries an hourly checkpoint marker. Marker rotation
changes the active source hash, so this commit is a point-in-time snapshot. Before
any future deployment, read the then-active source and settings, preserve the
current marker and all unrelated routes and bindings, and verify the proposed
source against that checkpoint. The repository test gate alone does not establish
that a later production Worker has identical bytes.

The deployment metadata lists no triggers, compatibility date `2026-08-25`,
and a Durable Object binding named `Agent_Engine` to
`seven-six-seven-2676_BriarwoodAg`. The source also accepts the earlier
`AGENT_ENGINE` spelling. No Cloudflare settings or stored Durable Object data
are changed by this PR.

Run `npm test` here before any Worker deployment. The GitHub Actions **POPCORN Worker payment wall gate** runs the same tests on every PR and main push. It checks that unpaid machine time and both witness routes return their path-bound x402 challenge before key import, freshness validation, body parsing, or facilitator contact, that a v1 payment proof cannot be replayed at v2, and that `/agent/status` remains free on its own route. These tests do not make a payment or deploy the Worker.

The GitHub check can gate a repository-based release, but it cannot block a manual Cloudflare dashboard deployment. A production release still needs a separately verified settings snapshot and live 402/200 checks. Do not infer that a passing PR check means the Worker was deployed.
