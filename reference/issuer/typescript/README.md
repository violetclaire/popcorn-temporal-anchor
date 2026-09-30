# TypeScript reference witness issuer

This module contains platform-neutral issuance cores for both
`POPCORN-WITNESS/1.0` and `POPCORN-WITNESS/2.0`. They validate digest-only
requests, construct signed scope and timing fields, and produce ES256 compact
JWS receipts.

The current paid path is `POST /v2/receipt`. Supply
`issuance_endpoint: "/v2/receipt"` to sign that exact path. The omitted option
retains `/v1/receipt` for existing integrations and historical fixtures. The
HTTP helper rejects a request whose path differs from the selected signed
endpoint. The TAIN metadata lookup remains `/v1/receipt/tain/{tain}`.

`handlePaidWitnessRequest` adds the bounded `POST application/json` HTTP
surface. Mount it behind the existing x402 v2 payment verification and
settlement middleware; it must never be exposed as an unpaid signing oracle.

It deliberately does not implement routing, x402 settlement, secret loading,
or a public HTTP server. A production Worker must call it only after payment
verification and must provide:

- the request-receipt timestamp captured at the outer HTTP boundary;
- the settled payment identifier and transaction reference;
- a non-extractable ES256 signing key;
- a published and defensible clock-accuracy radius;
- an unpredictable unique receipt ID.

Never put the private JWK, payment proof, or original payload in this
repository. The reference issuer accepts only the payload digest, nonce, and
optional predecessor-attestation digest.

```bash
npm install
npm run check
npm test
```
