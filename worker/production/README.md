# POPCORN Worker production-source export

`index.js` began as Violet's Cloudflare Worker export, supplied on 2026-09-27 as `seven-six-seven-2676-worker.js` (SHA-256 `8670769e6e022add6830d6e696c3342441099ad55776e3106d8d7f83c046afd3`). The three imported modules came from the local `work/tain-upgrade/release` snapshot; their deployed bytes have not been independently confirmed. No secret binding values are stored here.

The supplied deployment metadata says there are no listed triggers, compatibility date `2026-08-25`, and a Durable Object binding named `Agent_Engine` to `seven-six-seven-2676_BriarwoodAg`. The source also accepts the earlier `AGENT_ENGINE` spelling. No Cloudflare settings or stored Durable Object data are changed by this PR.

Run `npm test` here before any Worker deployment. The GitHub Actions **POPCORN Worker payment wall gate** runs the same tests on every PR and main push. It checks that unpaid machine time and witness requests return their existing x402 challenge before key import, freshness validation, body parsing, or facilitator contact, and that `/agent/status` remains free on its own route. These tests do not make a payment or deploy the Worker.

The GitHub check can gate a repository-based release, but it cannot block a manual Cloudflare dashboard deployment. A production release still needs a separately verified settings snapshot and live 402/200 checks. Do not infer that a passing PR check means the Worker was deployed.
