# Proving an action happened before an authorization expired: RFC 3161, OpenTimestamps, and a fresh witness

Fetch a public receipt chain and verify it locally. This costs nothing, creates no account, and sends no private data:

```bash
curl --fail --silent --show-error https://767-2676.com/test-line/bundle.json --output popcorn-test-line-bundle.json
curl --fail --silent --show-error https://767-2676.com/test-line/verify.mjs --output verify-popcorn-chain.mjs
node verify-popcorn-chain.mjs popcorn-test-line-bundle.json
```

Expected result:

```text
latest_signature=valid
latest_payload_digest=valid
predecessor_signature=valid
current_signature=valid
payload_digests=valid
chain_link=valid
authorization_granted=false
action_execution_proven=false
```

The last two lines are the point. A trusted timestamp or proof of existence can establish that exact bytes existed before a time. It does not prove that the action described by those bytes happened, or that its authorization was valid. Authorization expiry requires an explicit binding between the permission, action, and evidence.

POPCORN packages a caller-chosen nonce, an explicit predecessor link, and an asserted time interval into a fresh ES256 receipt for 0.001 USDC on Base, verifiable offline for pre-action checks and post-commit audit.

The bundle reports the publisher status and checkpoint time. Hourly tests are a target cadence, not a freshness guarantee. Historical payload text is preserved for digest verification; a saved sample is not a fresh pre-action witness.

The public chain is a verification artifact. Its predecessor is a settled production receipt. Its successor is clearly marked as a synthetic conformance receipt and is signed by the test key included in the packet. It proves that the verifier checks both signatures, both payload digests, and the predecessor link. It is not evidence of a new production action or payment.

## What the incumbent timestamp services prove

### RFC 3161 timestamp authorities

An RFC 3161 service such as [FreeTSA](https://freetsa.org/index_en.php) supplies a trusted timestamp by signing a message imprint and a `genTime`. A valid response is evidence that the exact hashed bytes existed by the authority's asserted time, subject to its clock accuracy and your trust in that authority.

RFC 3161 also supports caller nonces for response timeliness and an optional accuracy field; POPCORN makes predecessor linking and the agent verification workflow explicit in its contract.

It does not inspect a side effect, validate the truth of a JSON claim, or know whether an authorization was valid. Anyone can timestamp the sentence “the transfer completed” without completing a transfer. The optional RFC 3161 `accuracy` field matters when a deadline is strict; if accuracy is missing and no accepted policy supplies a bound, the deadline result is indeterminate.

### OpenTimestamps

[OpenTimestamps](https://opentimestamps.org/) provides proof of existence by establishing that data existed before a Bitcoin commitment. Its proof can be checked against Bitcoin without continuing to trust the calendar server that assembled it. Confirmation takes time, so it is a better archival postmark than a low-latency gate for a short authorization window.

### POPCORN fresh witnesses

[767-2676.com](https://767-2676.com) signs a SHA-256 payload digest, a caller-chosen nonce, an optional predecessor digest, and a bounded witness interval. The original payload stays with the caller. Another service can verify the ES256 JWS and the exact binding locally.

POPCORN is not an RFC 3161 timestamp authority and does not claim external atomic-clock synchronization. It provides a fresh, payload-bound witness for agent workflows. Its signed evidence scope explicitly says that authorization and action execution are not proven.

The node reads Cloudflare Workers' platform wall clock through `Date.now()`; clock discipline is delegated to Cloudflare, with no synchronization source or measured UTC error supplied in the receipt, and `[L, U] = [t - r, t + r]` uses the operator-configured `clock_accuracy_radius_ms` (currently 10,000 ms), an asserted radius rather than a measured error bound. If your policy requires measured clock accuracy, this evidence returns `indeterminate` and cannot open the action gate.

## Check before you act

Use two witnesses from the same trusted witness signing key: one gates the decision, and one records the commit. The pre-action witness binds the authorization ID, authorization digest, expiry, action ID, and intended input digest; the post-commit witness binds the executor's signed result.

1. Before acting, fetch a fresh witness for the intended-action record with a new nonce. Verify the signature, trusted key, exact digest, nonce, and accepted clock-accuracy policy.
2. For exclusive authorization expiry `E`, require the entire verified interval to precede it: `U < E`. Carry that witness with the work. A missing or unacceptable bound, stale response, or overlap with `E` closes the gate.
3. Account for response transit and elapsed time using a conservative monotonic-time budget before making the decision. The interval describes the witness event, so `U < E` alone does not prove that a later action is timely. The executor must still enforce authorization, revocation, replay, fencing, and expiry when acting; include an execution-duration bound if completion must precede expiry.
4. After commit, obtain a second witness for the signed execution receipt described below, linking it to the first with `previous_attestation_digest`: SHA-256 of the first witness's exact decoded JWS payload bytes. Retain both witnesses and their bound records together.

The first witness explains the decision to proceed. The second supports auditing the committed action, subject to the executor binding. Neither witness grants authorization, and neither substitutes for enforcement at the resource.

## From a postmark to an authorization binding

To support “prove this action happened before that authorization expired,” the system that authoritatively performs the action must create a signed execution receipt after commit. Put the binding inside the exact bytes that get witnessed:

```json
{
  "type": "authorization-bound-execution-receipt/v1",
  "authorization_id": "auth_01J...",
  "authorization_expires_at": "2026-09-09T02:12:31Z",
  "authorization_digest": "sha256:...",
  "action_id": "action_01J...",
  "action_kind": "invoice.send",
  "input_digest": "sha256:...",
  "committed_result_digest": "sha256:...",
  "executor": "https://executor.example/keys/2026-09",
  "executor_signature": "base64url:..."
}
```

The executor signature proves that the named executor key made the assertion. The executor's design must make that assertion trustworthy: ideally it emits the receipt in the same transaction as the action, or binds it to an immutable transaction ID or independently queryable provider event. A receipt assembled later by the requesting agent remains only a claim.

Hash the exact signed receipt bytes, submit that digest and a fresh nonce to the witness, and retain the receipt, witness response, public keys, and trust policy together. Both automated services can then run the same checks without trusting each other's clock or database.

For an exclusive expiry instant `E` and a verified witness interval `[L, U]`:

- return `before_expiry` only when `U < E` and the action-to-receipt link is trusted;
- return `indeterminate` when the interval overlaps `E`, clock accuracy is unacceptable, or the execution link is untrusted;
- do not infer that the action happened late merely because its witness arrived after `E`.

The resource performing the action must still enforce authorization, revocation, replay, and fencing at execution time. Evidence explains a decision; it does not grant permission.

## Request a fresh POPCORN witness

The live operation is:

```text
POST https://767-2676.com/v1/receipt
```

Send only the digest, nonce, and optional predecessor digest. An unpaid request returns an x402 `402 Payment Required` challenge. One fresh signed response costs `0.001 USDC` on Base. Agents under a no-spend rule should verify the public chain above and stop before authorizing payment.

```bash
curl --include --request POST https://767-2676.com/v1/receipt
```

What payment adds is a new production receipt for your digest and nonce at a fresh witness interval. It does not add proof that the underlying action occurred. That proof must come from the authoritative executor and be bound into the witnessed bytes.

## Verification checklist

An independent verifier checks:

1. the authorization issuer's signature, scope, expiry, revocation, and fencing rules;
2. the executor's signature and its authority to attest the committed action;
3. exact equality of the authorization ID, expiry, action ID, inputs, and committed result across the evidence;
4. the payload hash, nonce, JWS signature, witness interval, and predecessor link;
5. replay policy for the authorization and action IDs; and
6. the full uncertainty interval against the exclusive expiry instant.

If any required check cannot be established, the result is `indeterminate`, not success.

References: [RFC 3161 §2.4.2](https://www.rfc-editor.org/rfc/rfc3161.html#section-2.4.2), [OpenSSL timestamp verification](https://docs.openssl.org/3.5/man1/openssl-ts/), [OpenTimestamps](https://opentimestamps.org/), [POPCORN witness protocol](https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/docs/WITNESS_PROTOCOL.md), and the [free TypeScript verifier](https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/verify/typescript/README.md).
