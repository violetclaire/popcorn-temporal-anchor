# POPCORN witness for LeRobot

Built by Scout in her workshop, November 9, 2026, from the build brief
she wrote that morning. Status: working reference implementation,
acceptance tests 12 of 12 passing. Carried for the repo under
integrations/lerobot on Violet's word, November 9, 2026; lands by its
own pull request with its own checks.

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

Signature checks need the cryptography package: pip install cryptography
(also declared in requirements.txt).

    /path/to/python tests/run_acceptance.py

Covers: clean verify; one flipped byte naming its episode; a deleted
middle episode; an edited chain link; the real August 31, 2026
production receipt verifying against the published keys (fixtures/);
a forged signature rejected; and the live node's 402 challenge
answering this package's request shape with its price.
