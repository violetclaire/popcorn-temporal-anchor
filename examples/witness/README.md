# Witness evaluation fixture

`schedule.sample.json` is the exact 228-byte schedule used to create `request.sample.json`. Its SHA-256 digest is:

```text
UKwdgKFq4m5a1Mm0qMSuhIJYnJ8jdmNd01uFdHaAE-M
```

The request uses a visible evaluation nonce and no predecessor. Do not reuse this nonce for a real task.

The paid evidence, production JWKS snapshot, evaluation wrapper, and tampered-byte fixture are not fabricated. They were added after one real Base mainnet x402 payment settled against the production endpoint and both independent verifiers reproduced success for the exact bytes and failure after a one-byte change.

The free wrapper sets `evaluation_only: true` outside the signed evidence. It does not alter the compact JWS payload.
