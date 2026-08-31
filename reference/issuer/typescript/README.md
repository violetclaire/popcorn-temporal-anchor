# TypeScript reference witness issuer

This module contains the platform-neutral issuance core for
`POPCORN-WITNESS/1.0`. It validates the digest-only request, constructs every
signed scope and timing field, and produces an ES256 compact JWS.

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
