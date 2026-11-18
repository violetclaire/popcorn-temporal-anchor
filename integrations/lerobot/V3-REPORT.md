# LeRobot v3.0 support: build report

Built November 12, 2026, in this workshop copy only. Nothing was
published, pushed, copied into any repo, sent, or spent. Recording
remains a dry run everywhere: the witness proves fingerprint and
time only. No scores, no rankings, no custody, no paid receipt
anywhere in this task.

## What was added

- `popcorn_lerobot/v3.py` (new): the whole v3.0 path.
- `popcorn_lerobot/core.py`: a `dataset_format()` detector (reads
  `meta/info.json`; `"v3.0"` only when `codebase_version` is exactly
  `"v3.0"`, else `"v2.1"`) and a dispatch at the top of
  `record_dataset`. No existing v2.1 code path was edited.
- `popcorn_lerobot/verify.py`: the same dispatch at the top of
  `verify_dataset`. The v2.1 body is untouched.
- `tests/run_acceptance_v3.py` (new) and fixtures under
  `tests/workdir-v3/` (clean, tampered, deleted, reordered,
  chainedit).
- pyarrow is imported lazily, inside the v3 functions only. Verified:
  under plain system python3 (no pyarrow), the package imports, the
  v2.1 path records and verifies, and `pyarrow` never enters
  sys.modules.

## The canonical serialization: popcorn-canonical-rows/1

An episode's data fingerprint is the SHA-256 of manifest lines (the
existing design's style). The data line carries the SHA-256 of the
canonical serialization of the episode's rows, defined exactly as:

- Magic line `popcorn-canonical-rows/1`, then `columns N`, then one
  canonical-JSON line per column naming [field name, logical type
  string], then `rows M`, then every cell in stored row order and
  schema column order.
- Each cell is framed: one byte 0x00 for null, else 0x01 plus an
  8-byte big-endian body length plus the body, so framing is
  unambiguous. Bodies depend only on the decoded value and the
  logical type: bools one byte; integers ASCII decimal; floats the
  IEEE 754 big-endian bytes at the type's own width; timestamps and
  dates cast to int64 counts in the type's own unit (the unit is
  named in the header type string), ASCII decimal; strings UTF-8;
  binary raw; decimals ASCII; lists an 8-byte count plus each
  element as a framed cell; structs each field as a framed cell in
  schema order. Dictionary-encoded columns are decoded to their
  value type first.

Why this shape: the output depends only on values and the logical
schema, never on parquet file metadata, encoding, compression, or
row-group layout, so a verifier rebuilds it from the dataset alone
and a rewritten file with the same values fingerprints the same.
The manifest also commits, per camera, to the SHA-256 and size of
the whole shared video file plus the episode's from/to timestamps,
and to the identity fields from the meta row (episode_index,
length, tasks). Positions are NOT committed: dataset_from/to_index
and the chunk/file indices are used to find the content, never
hashed, so an episode's fingerprint is a function of its own
content only.

Records carry the same fields as v2.1 records and chain by the same
previous_attestation_digest rule. Two descriptive fields are added
(dataset_format: "lerobot-v3.0", and digest_commits_to, a plain
sentence stating the above). That addition was a judgment call: the
brief required the record to state what the digest commits to.

One deliberate difference inside the new v3 verifier: the chain is
checked over the records themselves, so a record whose episode
content is missing still advances the chain check and the next
episode is not falsely reported chain-broken. (The v2.1 verifier
does report that extra break; it is unchanged, by the design rule
that the v2.1 path must not change at all.)

## Failure modes, with the exact names printed

From the actual acceptance run (tests/run_acceptance_v3.py):

- Tampered (one byte): `episode 1: bytes changed after recording
  (digest d-bL7TwK0hqmua3H98ATQHS0tOknK504K-AvveVzD7g != recorded
  5HlKQBtV8uqNSsTZIoFeWNhU5Lv13D1RKqOFFZaeRCw)`. No other episode
  named. The tamper is a genuine RAW BYTE FLIP at file offset 796,
  inside the stored bytes of episode 1 frame 1's action[0] value
  (16.7), validated by readback: the file still parses and exactly
  one decoded cell differs, in episode 1. The value-rewrite fallback
  was not needed. (The fixture data files are written PLAIN-encoded
  and uncompressed so a stored value byte can be flipped; the
  witness reads decoded values only, so the encoding choice is a
  fixture convenience, not part of the format contract.)
- Deleted: `episode 1: recorded but missing from dataset`, and that
  is the ONLY problem printed: episodes 0 and 2 still pass, chain
  included. The fixture deletion is the real-rewrite kind: rows and
  meta row removed, surviving meta ranges updated to the new
  positions, surviving content (including each row's global `index`
  values and the episodes' video timestamps, which index the
  untouched shared video file) unchanged.
- Reordered (row blocks of episodes 0 and 2 swapped, meta
  unchanged): `episode 0: bytes changed after recording (...)` and
  `episode 2: bytes changed after recording (...)`. Episode 1 is
  not named and still passes.
- Hand-broken chain link: `episode 2: chain broken (names
  predecessor AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA, computed
  hy6ExPI2qNS_IRsNxid6aZ59OsoJmq3YRcBg9kZppnY)`.

Byte changes OUTSIDE every episode's rows: the implemented behavior
is that parquet file metadata is not committed at all. Tested: one
byte flipped inside the footer `created_by` string of the clean
data file leaves every decoded value unchanged, and the dataset
still verifies (empty problem list). A byte change that instead
corrupts file structure or a stored value surfaces loudly: a data
file that no longer parses reports `episode N: content unreadable
(...)` for each episode it holds, and an unparseable
meta/episodes file reports `episode N: episode metadata unreadable
(...)` for every recorded episode.

One format consequence worth stating plainly: because the
fingerprint commits to the whole shared video file, ANY change to
that file (including a rewrite that only removes a deleted
episode's segment) changes the fingerprint of every episode that
references it. That is what the brief specified (the containing
file's SHA-256 plus the episode's timestamps); the witness hashes
video bytes and never decodes them.

## Acceptance results, from the actual runs

(a) Existing suite, unmodified, run on a full copy of the tree (so
the shipped fixtures stayed pristine), with the build venv's
python: **12/12 passed** after the change (run 1 of the
post-change copy). Baseline before the change also reached 12/12.
Honest note: the suite's last check talks to the live node, and
this sandbox's gateway intermittently truncates or drops that
response, so some runs show 11/12 (or the fetch raises
RemoteDisconnected) on that one check alone, before and after the
change alike; by curl the node's 402 body is complete and names
amount "1000". Separately, the venv was missing the `cryptography`
package the suite's production-receipt checks need; it was
installed into .venv (cryptography 50.0.2). Without it those checks
fail with "the 'cryptography' package is required", which is an
environment gap, not a code result.

(b) Old-fixture comparison: re-recording a copy of the shipped
v2.1 clean fixture reproduces the stored payload_digest values
BYTE FOR BYTE (payload_digest only; nonces are fresh):
episode 0: 1HloHbYEsDTqPpPzBLsVvU5hwrO3aofeC38dYqFhgsc = stored.
episode 1: viMf9y8_M0vTxfA2w1b7Zfko0AZStv4PCvHfd9eDhxs = stored.
Confirmed at baseline and again inside run_acceptance_v3.py
against the modified package. The shipped fixture itself was never
rewritten: its episode 0 receipt still carries its original nonce.

(c) New v3 suite (tests/run_acceptance_v3.py, .venv/bin/python):
**15/15 passed.** Log, in order: the two (b) checks; v3 record
writes 3 receipts; first record starts a chain; chain links set;
records state format and commitment; clean verifies; tamper names
episode 1 only; deleted names episode 1 only with 0 and 2 passing;
reorder names episodes 0 and 2 with 1 passing; chain edit names
episode 2. The CLI also records and verifies a v3 dataset end to
end (`recorded 3 episode(s); nothing sent, nothing spent`, then
`OK: every episode matches its receipt and the chain is unbroken`).

## Decisions and things that did not work first try

- The two extra record fields (dataset_format, digest_commits_to),
  and the chain-advance difference in the v3 verifier, are the
  judgment calls; both are stated above and in the code.
- The fixture rows carry a global `index` column, as real v3.0
  data does, and the deleted fixture keeps the survivors' index
  values untouched ("content untouched"), so their fingerprints
  hold. A rewriter that renumbered that column would be changing
  the rows, and the witness would say so.
- First runs failed on pyarrow class names (pa.Float32Type and
  pa.HalfFloatType do not exist in pyarrow 26); the float branches
  now use pa.types.is_float16/is_float32/is_float64.
- Nothing else failed. The raw byte flip worked, so the documented
  fallback (flip a value and rewrite) was not used.
