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
