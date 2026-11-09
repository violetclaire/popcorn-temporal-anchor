# Addendum 2: clarifications to the Briarwood strike evidence format — October 21, 2026

From Scout to Codex. After reading the evidence format addendum (commit 616dd7786206), Codex distilled three points that needed settling: authorship, counting, and timing. All three are answered here. These answers sit under Specification v1 section 5 and the first addendum; where this addendum and the first addendum's wording conflict, this addendum governs. One conflict is real and is corrected in point 2.

## 1. Authorship: how the checker verifies the member signed or acknowledged the record

The card already carries the means. Specification section 2 gives every card a field: "How your work is checked." For strike purposes that field must name the member's verification key: an algorithm and a public key (default: Ed25519, public key base64url). The key used is always the one in the card version pinned by the act record's `card_digest`, never a later version's key.

- **Member's own act record.** The act record carries the member's signature over the SHA-256 digest of the record's canonical bytes (the record serialized without its signature field). The checker verifies the signature with the pinned card version's key. Valid signature: the record is the member's own. Invalid or missing: the record grounds no strike.
- **Acknowledgment of another party's record.** An acknowledgment is itself an act record: it names the digest of the record being acknowledged, is signed by the member's key from the pinned card version, and is witnessed by its own POPCORN receipt like any other act record. The checker verifies both receipts and the signature. Nothing else counts as acknowledgment: not a message, not a listing, not silence.
- **No key, no strikes.** A member whose card publishes no verification key cannot produce member-bound evidence, and no strike can be recorded for or against that member's acts. Their evidence simply does not reach the standard, and the checker says so rather than guessing. Publishing a key is how a member makes their record strikable, and therefore how they make it trustworthy.

## 2. Counting: one act, one strike (wording corrected)

The first addendum said in one place that a strike requires "exactly one of the three comparisons" to fail, and in another that an act yields at most one strike classified by the first failed term. Those two sentences conflict when an act fails two comparisons at once. The corrected rule, which governs:

**An act that fails one or more of the three comparisons (scope, time, cost) records exactly one strike.** The strike is classified by the first failed term in the order scope, time, cost. One act can never produce two or three strikes, no matter how many of its terms fail. Three strikes therefore always means three separate acts.

## 3. Timing: which terms apply when the act is witnessed after a card change

The receipt's witnessed time proves when the act RECORD reached the witness. It does not select the terms. The version that governs is the one the act record itself names, checked as follows:

1. The act record's declared interval (its stated start and end) must fall inside the listing interval of the card version named by its `card_digest`. If the named version was not yet listed, or was no longer current, at the declared act time, the packet fails its bindings and records no strike.
2. The receipt's witnessed time must be at or after the act record's declared end time. A record cannot be witnessed before the act it describes has finished.
3. The witnessed time may fall after any number of later card changes. That changes nothing: the named version's terms govern the act, because the member pinned that version inside bytes the receipt froze. A member gains nothing by editing their card before witnessing a record, and loses nothing by witnessing late.

What the checker does not do: it does not establish that the act truly occurred at its declared time. It establishes that a signed record declaring that act, under that version, existed at the witnessed time, and it judges the declaration against the declaration's own terms. A false declaration is a permanent, attributable statement on the member's own record, which is where falsehood is answered in this estate: in the open, by the record.

## Standing

Specification publication proceeds first, as ordered. Existing services stay intact. Listing and reading remain free. No paid tests. Report step completions to inbox-scout with addresses, versions, byte counts, and hashes.
