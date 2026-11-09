# OpenTimestamps operations and a POPCORN witness: a worked example

This example verifies one OpenTimestamps calendar aggregate inclusion path and the separate, original POPCORN receipt for its root. It uses evidence collected on October 7, 2026. Verification is local and free; it creates no new receipt and makes no network or payment requests.

The connection you can check is:

```text
44-byte calendar aggregate commitment
  -> 27 OpenTimestamps hash/append operations
  -> 32-byte batch root
  -> SHA-256 of those raw root bytes
  -> digest bound by the original POPCORN ES256 signature
```

The two evidence formats retain their own meanings. This is an exported OTS operation path joined to a separate POPCORN witness, rather than conversion of a POPCORN receipt into a native `.ots` file.

## Run the check

Use Node.js 20 or newer. Download this directory or clone the repository, then run:

```sh
node examples/opentimestamps-aggregate/verify.mjs
node --test examples/opentimestamps-aggregate/verify.test.mjs
```

No package installation is needed. Read the small verifier before running it. It uses Node's built-in hashing, signature verification, and file-reading functions. It reads only the companion files and prints its result.

Successful verification establishes that the supplied aggregate follows the supplied operations to the root; the original receipt signature verifies under the pinned issuer key; and the signed digest equals SHA-256 of the 32 raw root bytes. The tests also alter the commitment, proof, receipt, and key to check that invalid evidence is rejected.

## Evidence files

| File | Purpose |
| --- | --- |
| `packet.json` | One aggregate, its serialized OTS operations, the expected root and receipt identifiers, and unsigned source provenance. |
| `receipt.json` | The complete original POPCORN response, preserved byte for byte. |
| `issuer-public-keys.json` | Public issuer keys captured with the original evidence. No private key is included. |
| `verify.mjs` | Dependency-free verifier for this specific example. |
| `verify.test.mjs` | Positive and negative verification tests. |

The receipt is `POPCORN-WITNESS/2.0`, issued by `767-2676.com`, with TAIN `tain_01M4C7CXTTTARBVWDT5Q60GZDY`. Its signed witness time is `2026-10-07T22:22:59.418Z`; the original signed time window is preserved in the response. These are the node's signed clock assertions, not an independently measured physical-clock bound.

The exact root is:

```text
edff70d8ebda08ba937dd6da7f3bfe6e2eaf068c0590f75eeda94815d3637754
```

Hash its 32 decoded bytes, not the 64-character hexadecimal representation. The verifier makes that distinction explicitly.

## Provenance and key trust

The aggregate and operation path were extracted from Bob's public calendar archive. The saved source is [archive chunk 108774](https://bob.btc.calendar.opentimestamps.org/experimental/backup/108774), whose SHA-256 is recorded in `packet.json`. This example publishes one path; it does not publish or claim verification of the calendar's entire queue.

Source attribution is unsigned provenance. The offline verifier proves the supplied path's mathematical connection and the POPCORN signature; it does not fetch or parse the archive to authenticate which calendar supplied it. A separate preparation check matched the saved archive with a fresh public download and confirmed that it contains the selected aggregate. Independent review also checked all 27 operations against that archive's records.

The verifier pins the captured issuer key's RFC 7638 public-key thumbprint independently of the packet. Check the key against the issuer's [published public keys](https://767-2676.com/.well-known/popcorn-keys.json) or a previously trusted copy. A bundled key alone cannot establish who controls the issuer. The thumbprint is:

```text
ns4g75U5Bsn2bA3XtaSuQhDg065PVkhYgs3KOtJVPf0
```

The original receipt contains signed payment references because those bytes are part of the unchanged evidence. This verifier does not independently check settlement on Base.

## What this example does not establish

- The original files behind the aggregate, their owners, their content, or their submission times. A file holder needs the earlier operations in their own `.ots` proof to connect a file digest to this aggregate.
- Bitcoin inclusion or consensus. This example stops at the witnessed batch root and does not verify a Bitcoin header or chain. It makes no claim that POPCORN witnessed the root before Bitcoin anchoring.
- Authorization, identity, execution, calendar endorsement, or present-day freshness. The original receipt's evidence scope and historical time remain unchanged.
- A native OpenTimestamps receipt issued by POPCORN, or an RFC 3161 token. Each protocol needs its own verifier and trust policy.

## Sources and permissions

- [OpenTimestamps](https://opentimestamps.org/): timestamping and independent verification.
- [OpenTimestamps operation definitions](https://github.com/opentimestamps/python-opentimestamps/blob/master/opentimestamps/core/op.py): serialized SHA-256 and binary operations. The verifier is locally authored and does not bundle the upstream library.
- [Calendar archive implementation](https://github.com/opentimestamps/opentimestamps-server/blob/master/otsserver/backup.py).
- [POPCORN receipt carry-and-use permission](../../docs/RECEIPT_USE.md), [repository licensing boundaries](../../LICENSING.md), and [Read-and-Use Terms](../../LICENSE.md). Third-party material retains its own applicable terms; names identify sources and imply no endorsement.

Published October 26, 2026, using the existing October 7 receipt. No new witness issuance or payment was needed for this example.
