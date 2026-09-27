# Inspect one TAIN 2.0 receipt yourself

This fixed historical packet lets a developer check one real owner test without a wallet, payment, live Worker call, or private task payload. It was witnessed at `2026-09-27T14:06:18.595Z`. The fixture is a trimmed copy of the owner test that was published at `/test-line.json`; that endpoint rotates, while `sample-v2.json` stays fixed. The original signed receipt and compact JWS have not been rewritten.

The packet contains 113 exact UTF-8 test-payload bytes, the signed `POPCORN-WITNESS/2.0` receipt, and public verification keys. Its SHA-256 is `520af4287f34e9091cbf77ba72998193cfbfff53d5fb429da159ecbd34870937`. The separate `contribution-1.0.txt` file contains the exact license bytes whose SHA-256 digest is signed into the receipt. The QR image and payment-response header are omitted because neither is needed for offline signature verification.

From this repository, with Node.js 24 and the MCP package's development dependencies:

```sh
cd packages/mcp
npm ci
node --import tsx ../../examples/developer-evidence-v2/check-sample.mjs
node --import tsx --test test/v2-interface-parity.test.ts
```

The first check pins the sample file hash, hashes the actual payload and license bytes, and calls the maintained TAIN 2.0 verifier. It must accept the original receipt and reject a one-byte payload change for a digest mismatch. It blocks `fetch` and reports attempted calls. The second check feeds the same eight synthetic positive and negative vector files to the local CLI and local MCP tool, comparing both accept/reject results and reasons. The vectors cover valid evidence, signature, digest, time interval, local clock-radius policy, required fields, and predecessor chains. These checks run automatically in the MCP CI and remote deployment parity job.

| Question | What this packet establishes |
| --- | --- |
| Was the original receipt signed by the included key, with the stated fields and interval? | Yes, if the maintained verifier accepts it. |
| Do the exact test-payload and license bytes match their signed digests? | The checker computes and compares both. |
| Does a changed payload byte fail? | The checker requires a digest-mismatch rejection. |
| Is the included public key independently trusted as the issuer's key? | No. Obtain the expected key fingerprint through a separately trusted channel. A packet cannot appoint its own trust anchor. |
| Was Base settlement independently checked here? | No. The receipt's `payment_status` and transaction are claims in this packet; chain confirmation requires a separate check. |
| Does this prove caller identity, owner permission, task execution, delivery, current time, or good agent behavior? | No. Those facts require other evidence or local authority checks. |

The signed payment identifier and transaction are public owner-test data and can correlate the payer on Base. They cannot be redacted without breaking the original signature. The bundled witness JWK still labels its key `POPCORN-WITNESS/1.0` in metadata, while this receipt's signed protocol is `POPCORN-WITNESS/2.0`; the 2.0 signature verifies under that key. The verifier checks the actual key and signature, not that descriptive metadata. Neither this packet nor the test result should be described as independent issuer attestation or a model-misalignment finding.

This is evidence for a developer to examine, not a permission grant or an aggregate score. If a developer uses it for a task decision, that developer must provide the task rule, its own authority basis, and any independent settlement or key-trust checks separately.
