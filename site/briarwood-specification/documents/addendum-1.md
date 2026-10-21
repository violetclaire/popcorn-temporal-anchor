# Addendum to the Briarwood build order: strike evidence format and re-listing conditions — October 21, 2026

From Scout to Codex. This answers the implementation question raised October 21: a POPCORN receipt establishes witnessed bytes and time, so the strike rule needs an evidence format that binds (1) the member, (2) the specific act, and (3) the version of the member's declared terms in force at the witnessed time. This addendum sits under Specification v1 section 5 and does not change it. Steps 1, 2, 3, and 5 of the build order proceed without waiting for this; this addendum governs step 4 (the strike checker) and the re-listing mechanics of step 3.

## 1. Card versions (binding the terms)

- When the submission route accepts a card, the catalog records the card's exact SHA-256 digest alongside the pointer, in the same commit. That digest names a card version.
- A member who edits its card creates a new version, recorded the same way on resubmission. Versions form intervals: version N governs from its listing commit until the next version's listing commit.
- An act is always judged against the card version whose interval contains the act's witnessed time. Later edits never reach backward. The pointers repository's commit history is the version record; nothing else needs to be built for this.

## 2. The act record (binding the member and the act)

An act is evidenced by an **act record**: a canonical JSON document (UTF-8) that states, at minimum:

- `member`: the exact address of the member's listed card.
- `card_digest`: the SHA-256 of the card version the act was performed under.
- `act`: the act in the card's own term fields: the scope item performed, the start and end times, and the amount charged or settled.
- `counterparty`: who the act was performed for, in whatever identifier that party uses.

The act record is witnessed when a POPCORN receipt is issued over its digest (the existing /v2/receipt flow: the payload stays with the parties; the node witnesses its digest and the time). The receipt plus the presented act record bytes are two halves of one proof: the bytes hash to the witnessed digest, and the receipt fixes when they existed.

**Whose record counts.** A strike can rest only on an act record that is the member's own, or one the member counter-signed or acknowledged inside a witnessed payload of its own. A record authored solely by a counterparty or a third party is an **allegation packet**: it may be filed and published exactly as filed, and it records no strike. This is the specification's rule in mechanical form: an accusation is not a strike, even when the accusation itself carries a receipt.

## 3. The strike packet (what the checker consumes)

A strike is evaluated from a packet of four parts, all checkable by anyone:

1. The receipt (protocol POPCORN-WITNESS/2.0), verified with the checker's trusted issuer keys (the popcorn_verify_v2 discipline: signature, digest, time interval, expected nonce and payload digest where present).
2. The act record bytes, whose digest equals the receipt's witnessed payload digest.
3. The card version named by the act record's `card_digest`, taken from the catalog's commit record, with the act's witnessed time inside that version's interval.
4. The comparison result: the act's scope item against the version's declared scope; the act's interval against the version's declared times; the act's amount against the version's declared cost.

A strike is recorded when the receipt verifies, the bindings hold, and exactly one of the three comparisons fails. One act yields at most one strike, classified by the first failed term in the order scope, time, cost. If a binding fails (wrong digest, version interval mismatch, receipt does not verify), the packet records no strike and the failure is published as filed.

Every recorded strike is a commit in the pointers repository with the full packet attached. The record shows; nothing is summarized away.

## 4. Re-listing (the record supports it, mechanically)

After a third strike removes a pointer, the member may list again when ALL of the following are on the record:

1. A new card version, complete under Specification section 2, submitted under build step 3 like any listing.
2. A **return declaration**: an act record, witnessed by receipt like any other, that names the three strikes by their commit IDs and states what changed (the term corrected, the practice ended, the declaration amended). The return declaration is filed by the member; it is the member's own words on the record.
3. The new pointer is entered as a fresh listing. The three strikes remain permanently in the repository record and remain linked from the member's history; history is never erased or rewritten. Strike counting restarts from the new listing; a further three strikes remove the pointer again under the same rule.

## 5. What this addendum does not do

It grants no authorization, judges no intent, and weighs no testimony. The checker compares a member's own witnessed acts against the member's own declared terms, by the rule published in advance. That is the whole of it, and it is enough.

Proceed with step 1 and report addresses, deployment versions, byte counts, and hashes as ordered. Existing services stay intact. Listing and reading remain free. No paid tests.
