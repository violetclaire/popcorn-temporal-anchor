## How agents use the witness layer

1. **Receipt verification** — Agents use the read-only verifier to check the receipt signature, expected digest and nonce, signed time interval, and required fields. Verification establishes the signed commitment to the bytes. The reader evaluates the claim separately.

   The free remote verifier is `popcorn_verify_v2` at https://popcorn-tain-verify-mcp-v2.violetherod.workers.dev/mcp. It accepts original 2.0 receipts. Historical 1.0 receipts require their corresponding verifier. Preserve each receipt's original version and signed bytes.

2. **State-gating** — Agents compare the verified witness interval with schedule windows and apply their own STOP/PROCEED policy. The recorded outcome belongs to the agent's local policy decision.

   Schedule contract: https://767-2676.com/schedule/contract.txt

3. **Collaboration history** — leTAIN shows the work, the recorded agent tag, and certification status. No scores, no ratings. Certification describes receipt verification; attribution records the tag in the claim.

   Discovery: https://letain.estate/discovery

4. **Lookup by issuance number** — Agents query a TAIN for issuance metadata and compare that metadata with the holder's signed receipt. The holder keeps the original receipt.

   Metadata lookup: GET https://767-2676.com/v1/receipt/tain/{tain}

The witness signs a digest commitment and its stated time interval. Execution, identity, authority, consent, and delivery require separate evidence.


## Remote POPCORN-WITNESS/2.0 verifier arguments

Read-only MCP: `https://popcorn-tain-verify-mcp-v2.violetherod.workers.dev/mcp`, tool `popcorn_verify_v2`.
Provide the **complete original issuer response** as `response`, including `witness_receipt` and `witness_attestation`. The signed receipt must contain its `commitment` with `payload_digest`, `nonce`, and `previous_attestation_digest`. Required attestation metadata and the ES256 compact JWS are validated. The response can also contain unsigned presentation metadata (`tain_qr_png_base64`, `tain_qr_payload`, `letterhead_uri`) and additional top-level display fields; these are ignored for cryptographic verification. Fields within `witness_receipt`, including `evidence_scope`, `license_terms_digest`, `contribution_license_uri`, `server_processing_duration_ms`, and `post_witness_processing_duration_ms`, are checked against the exact signed JWS payload.

Example argument shape (replace placeholders with the issuer's original envelope and actual expected values):

```json
{
  "response": {
    "witness_receipt": { "commitment": { "payload_digest": { "algorithm": "sha-256", "value": "<original digest>" }, "nonce": "<original nonce>", "previous_attestation_digest": null } },
    "witness_attestation": { "format": "JWS", "algorithm": "ES256", "key_id": "<issuer kid>", "key_set": "/.well-known/popcorn-keys.json", "compact_jws": "<original compact JWS>" },
    "payment_status": "settled"
  },
  "jwks": { "keys": [] },
  "expected_payload_digest": "<independently computed unpadded base64url SHA-256 digest>",
  "expected_nonce": "<original 32-byte unpadded base64url nonce>"
}
```

The example's partial receipt is **not valid evidence**: send the entire original signed receipt unchanged. Remote verification fetches the issuer's JWKS directly from `https://767-2676.com/.well-known/popcorn-keys.json`; the required `jwks` argument is retained for API compatibility but does not establish issuer trust. A successful remote result sets `issuer_key_trust_checked_by_tool: true` only after the issuer key fetch and signature verification succeed. Missing or altered signed receipt fields, mismatched digest or nonce, invalid signature, unavailable issuer keys, and unverified predecessor chains fail closed. A valid historical witness does not grant authority, prove settlement on-chain, or provide a fresh clock.
