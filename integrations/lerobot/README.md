# POPCORN witness for LeRobot

Built by Scout, November 9, 2026, from the owner's build brief.
Status: working reference implementation, acceptance tests 12 of 12
passing. LeRobot v3.0 datasets (the layout LeRobot v0.7.0 writes) are
supported since November 12, 2026, in popcorn_lerobot/v3.py, with
their own acceptance suite passing 15 of 15; see V3-REPORT.md. The
format is detected from meta/info.json, and record and verify dispatch
on it automatically. The v3.0 path needs pyarrow; the v2.1 path needs
nothing beyond the standard library. This package also lives in the
POPCORN repository under integrations/lerobot, on the branch
feat/2026-11-09-lerobot-witness with its own pull request (open, not
merged); this copy and that branch are kept byte-identical.

## What it does

LeRobot datasets are lessons: recorded episodes a robot was taught
with. Today a shared lesson is trusted because its uploader says so.
This package fingerprints every episode at recording time, chains the
records in order using the POPCORN protocol's own
previous_attestation_digest field, and lets anyone verify a downloaded
dataset offline: bytes unchanged since recording, chain unbroken, and,
where a paid witness receipt is attached, the signature valid under
the witness node's published keys.

## Commands

    python -m popcorn_lerobot record <dataset>
    python -m popcorn_lerobot verify <dataset> --jwks https://767-2676.com/.well-known/jwks.json

Recording is always a dry run: it sends nothing and spends nothing.
The paid door (POST https://767-2676.com/v2/receipt, $0.001) is
assembled in popcorn_lerobot/witness.py and can fetch the node's real
402 challenge so an operator sees the price first. Payment execution
is deliberately not in this package: paying runs through the owner's
execution gate, and a receipt is evidence, not permission.

## What a check establishes, and what it does not

A passing verify establishes that the episode bytes match the
fingerprints recorded for them, in the recorded order, and that any
attached witness receipt is genuinely signed and commits to those
same fingerprints. Verification depends on accepting the witness
node's published key and its clock.

It does not establish that the teaching was good, the robot was safe,
the sensor told the truth, or the uploader is anyone in particular.
There are no scores, no rankings, and no custody: receipts live with
the dataset, keys stay with their owners, and only fingerprints ever
travel.

## Tests

    /path/to/python tests/run_acceptance.py

Covers: clean verify; one flipped byte naming its episode; a deleted
middle episode; an edited chain link; the real August 31, 2026
production receipt verifying against the published keys (fixtures/);
a forged signature rejected; and the live node's 402 challenge
answering this package's request shape with its price.

For v3.0 datasets: python tests/run_acceptance_v3.py (with pyarrow
installed) covers the byte-for-byte v2.1 digest reproduction, plus a clean v3.0
verify, a one-byte change naming episode 1, a deleted middle episode
with the survivors still passing, a row-block swap naming both
swapped episodes, and an edited chain link naming its episode.
