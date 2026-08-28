# Security

## Report a vulnerability

Do not publish security reports as GitHub issues. Email
[`violet@briarwood.ai`](mailto:violet@briarwood.ai) with:

- the affected public endpoint;
- reproduction steps;
- observed and expected behavior;
- potential impact;
- whether payment, receipt verification, or private data is involved.

Do not include private wallet keys, API credentials, or unrelated personal data.

## Secrets

This repository must never contain:

- EVM private keys or wallet seed phrases;
- CDP API key IDs or secrets;
- `POPCORN_SIGNING_KEY_JWK` or any private JWK member;
- Cloudflare API tokens;
- x402 payment signatures or reusable authorization material;
- private `task_payload`, schedules, availability, pricing, or trust state.

Examples read secrets only from local environment variables. `.env` files and
private-key formats are ignored by Git.

## Trust boundary

A POPCORN receipt is evidence, not authorization. Verifiers must validate the
JWS, signing key, signed timing relationships, freshness deadline, network
uncertainty, and their own participant-local execution policy.
