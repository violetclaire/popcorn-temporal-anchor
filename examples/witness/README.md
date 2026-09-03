# Witness evaluation fixture

Run the STOP packet and its one-byte digest control locally, with no wallet or
network payment:

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types examples/witness/verify-settled-sample.mjs
```

The command exits zero only after the ES256 signature and exact payload digest
verify, the signed witness window produces `STOP`, and the published mutation at
byte offset 226 produces
`witness_payload_digest_does_not_match_expected`.

The original `schedule.sample.json` is the exact 228-byte schedule used to
create `request.sample.json`. Its SHA-256 digest is:

```text
UKwdgKFq4m5a1Mm0qMSuhIJYnJ8jdmNd01uFdHaAE-M
```

The request uses a visible evaluation nonce and no predecessor. Do not reuse
this nonce for a real task. Its settled checkpoint is cryptographically valid,
but it falls after the schedule closed. Under the example overlap policy in
`evaluation-outcomes.json`, packet `001` therefore demonstrates **STOP**.

`evaluation-packet.proceed-002.production.json` is the separate settled
companion. Its exact 228-byte schedule digest is:

```text
kvYtty3Ifr6SMK8xU76uP0OowwGRCELi6nufb1hWh3M
```

Its signed witness interval falls inside its execution window. Under the same
example policy, packet `002` therefore demonstrates **PROCEED**. Both packets
also include a one-byte tamper case that fails verification.

The paid evidence, production JWKS snapshot, evaluation wrappers, and
tampered-byte fixtures are not fabricated. Each production packet follows a
real Base mainnet x402 settlement against the production endpoint and
independent verification of exact-byte success and one-byte failure.

The free wrapper sets `evaluation_only: true` outside the signed evidence. It does not alter the compact JWS payload.
