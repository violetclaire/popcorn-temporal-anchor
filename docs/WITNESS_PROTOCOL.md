# POPCORN-WITNESS/1.0

`POST /v1/receipt` is a paid, digest-only witness service. It signs evidence that a specific 32-byte SHA-256 commitment was presented to `767-2676.com` at the stated time.

The agent keeps the schedule or other payload. POPCORN receives only:

- a SHA-256 digest of the exact payload bytes;
- a caller-generated 32-byte nonce; and
- either `null` or the SHA-256 digest of the preceding receipt's exact signed payload bytes.

POPCORN does not receive or store the underlying payload. It does not identify the caller, authorize an action, reserve a slot, enforce nonce uniqueness, prevent replay, prove delivery, or prove that the committed action happened.

## Request

```http
POST /v1/receipt
Content-Type: application/json
```

```json
{
  "payload_digest": {
    "algorithm": "sha-256",
    "value": "<unpadded-base64url-32-bytes>"
  },
  "nonce": "<unpadded-base64url-32-bytes>",
  "previous_attestation_digest": null
}
```

All three fields are required and additional fields are rejected. The body limit is 4 KiB. Query parameters and non-JSON content types are rejected before payment.

For a chain, split the preceding receipt's `compact_jws` on `.`, base64url-decode the second segment, and set `previous_attestation_digest` to the SHA-256 digest of those exact signed payload bytes. Encode the 32-byte digest as canonical unpadded base64url, the same as `payload_digest`. A verifier must require the preceding receipt, verify its signature and signed relationships, then compare the digest. `null` starts a chain.

## Payment and response

An unpaid valid request receives HTTP `402` with x402 v2 Base mainnet USDC terms. A successfully settled request receives HTTP `200` containing:

- `witness_receipt`, the signed evidence statement;
- `witness_attestation`, an ES256 compact JWS and key metadata; and
- `payment_status: "settled"`.

The witness signing key is separate from the existing POPCORN temporal receipt key and is published in `/.well-known/popcorn-keys.json` with `popcorn_protocol: "POPCORN-WITNESS/1.0"`.

## Consumer obligations

A verifier must have the exact expected payload bytes or expected digest, expected nonce, the preceding receipt and its verification inputs when chained, an independently obtained JWKS, and a locally selected maximum clock-accuracy radius. It must:

1. validate the envelope, receipt, JWS header, and public key strictly;
2. verify the ES256 signature;
3. hash the exact payload bytes and compare the digest;
4. compare the expected nonce and, when chained, verify the preceding receipt before checking its signed-payload digest;
5. reject a clock radius broader than local policy; and
6. consume the returned replay key only once within its own system.

The service returns replay keys for consumers to enforce. The service itself does not maintain a global nonce registry.

## Free evaluation packet

The eventual public evaluation packet wraps one real paid production response without modifying the signed JWS payload. `evaluation_only: true` belongs only in the unsigned outer wrapper. The packet includes exact schedule bytes, digest, nonce, predecessor value, paid evidence, public key, expected successful verification, and a one-byte tamper case that must fail.

The free packet is for evaluation. Agents pay only when they need fresh evidence for their own payload and nonce.
