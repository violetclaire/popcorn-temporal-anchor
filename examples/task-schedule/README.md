# Task schedule sample

This is the exact 305-byte `TASK-SCHEDULE/1.0` sample published at
https://767-2676.com/schedule. `schedule.txt` uses UTF-8 without a BOM, eight
LF-terminated lines, and a final LF. The `who` field is included in the digest.

SHA-256 (base64url): `j8sufEx87iPci7eCPfHntKZ9M72mTpbyzqn8StjfyX0`

SHA-256 (hex): `8fcb2e7c4c7cee23dc8bb7823df1e7b4a67d33bda64e96f2cea9fc4ad8dfc97d`

`packet.json` retains the exact bytes, digest, nonce, full live-issued witness
response, archived public keys, and a separate historical temporal observation.
The witness signature, exact payload digest, and nonce verify with the maintained
verifier. The free sample also changes one byte of `who` and requires rejection.
The timestamp interval in the sample output is the historical witness window,
not current time. The temporal policy replay is not proof of task execution.

Expiry is `2026-09-09T08:00:00Z`. A signature can continue to verify after the
schedule expires; it does not grant permission to act.

No earlier `TASK-SCHEDULE/1.0` packet without `who` was used for this sample.
Older JSON execution-schedule packets under `examples/witness` are retained as
historical evidence in their original format. They are not relabeled as this
contract, and their signed digests are not rewritten. The new default task
schedule example has been hashed and witnessed with `who` included.
