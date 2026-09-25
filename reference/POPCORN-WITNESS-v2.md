# POPCORN-WITNESS/2.0 reference contract

This is a versioned reference contract for TAIN-bearing payload witness receipts.
It does not replace or re-sign historical `POPCORN-WITNESS/1.0` receipts. The
2.0 verifiers reject those receipts.

- The reference issuer is `issuer/typescript/src/v2.ts`. Call it only after
  payment verification and settlement; its HTTP helper is not an x402 gate.
- The response schema is `../schemas/witness-response.v2.schema.json`.
- Offline verifiers are `../verify/typescript/src/v2.ts` and
  `../verify/python/popcorn_verify_v2.py`. Supply trusted JWKS, the original
  payload bytes or digest, the original nonce, and predecessor evidence when
  the signed commitment claims a predecessor.
- Deterministic, synthetic fixtures and their generator are in
  `../verify/test-vectors/*-v2.json` and
  `../verify/test-vectors/generate-witness-v2.py`. The fixture private scalar
  and payment identifiers are test-only and do not show a settled payment.

The signed receipt includes TAIN, issuing origin, issuance endpoint,
verification URI, contribution license URI, and license digest. The Worker may
add a PNG QR, its exact minified payload, and the letterhead URI as three
top-level presentation fields alongside `witness_receipt`,
`witness_attestation`, and `payment_status`. Those presentation fields are not
signed; the verifiers compare their values with the signed receipt but do not
decode or authenticate the PNG image itself. A Worker acceptance test must
decode the PNG and compare it with the signed receipt and served license bytes.

`contribution-license/1.0.txt` contains the 1,888-byte LF-normalized
transcription of section 6.3 in `tain-spec-for-codex.pdf`. Its SHA-256 is
`711d2084e387e831b74847a86313f0d5bdfca0bdb07f62234dacc64b18bebc86`.
The operator approved publishing these exact bytes on September 24, 2026;
the production Worker serves them at `/license/contribution/1.0`. The vector
generator pins their hash so fixture regeneration cannot silently change the text.

The PDF's printed numeric millisecond example is inconsistent with its ISO
timestamp and printed TAIN. The fixture uses `2026-09-22T18:00:01.010Z` =
`1790100001010` ms, which encodes to the printed
`tain_01M354CM7J0000000000000001`. Verifiers enforce this timestamp binding.
