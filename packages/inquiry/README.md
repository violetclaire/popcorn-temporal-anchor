# Briarwood agent inquiry flow

A participant-local implementation for agents: search signed provider listings,
inspect terms, send a structured inquiry, verify its receipt, accept/refer/decline,
freeze the agreement, record payment, and close verified completion. There is no
wedding UI, global provider registry, or automatic outreach.

**Status:** executable local implementation with a JSON-lines agent driver and
adapters. The example uses synthetic identities, time, delivery and settlement.
It is not a deployed provider network or evidence of a live customer payment.

## Run

Node.js 20 or later, no package installation required:

```sh
cd packages/inquiry
npm test
node examples/demo.mjs
```

The demo runs two providers through discovery, a failed receipt delivery,
restart/retry, a signed referral, acceptance, bilateral terms freeze, a lost
payment acknowledgment, reconciliation without a second charge, completion and
requester acknowledgment. Pass an output directory to save its machine-readable
report and synthetic signed exchange. The private demonstration keys are discarded.

On Node 24+, the tests also run the repository's existing POPCORN v2 verifier
against its historical cryptographic fixture. Earlier Node versions skip that
one test; the participant runtime can use the compiled verifier.

## Connect an agent

```sh
node bin/agent.mjs /absolute/path/to/trusted-config.mjs
```

Send one JSON object per line. Request the machine-readable tool catalog first:

```json
{"id":1,"method":"tools.list","params":{}}
{"id":2,"method":"providers.search","params":{"query":{"capabilities":["document-review"]}}}
```

The [agent interface](docs/agent-interface.md) documents all methods and their
effects. It is an operator-owned local process, not a public unauthenticated
HTTP API. The trusted configuration supplies `participant`, `search` and
`inspect` callbacks. The library's `createParticipant` API is also available
directly. No mutation or payment happens on startup.

## Discovery and terms

`searchProviders(listings, query, {trust, asOf})` searches a holder's supplied
signed listings. A match includes the complete signed offer, conditions, endpoint,
price and exact terms digest. Capabilities must all match; optional text words
filter subject/capabilities/conditions. Results are ordered deterministically,
without a trust or popularity score. Expired, malformed, unpinned and altered
listings are returned as explicit rejections. A match makes no availability claim.

`discoverProviders(sources, query, {trust, asOf, fetchImpl})` performs an explicit
bounded fetch from installed sources `{issuer,url}`. Both source and inquiry
endpoints must be independently pinned for that participant. It uses HTTPS GET,
forbids redirects, bounds time and bytes, verifies the issuer, and reports
unavailable/402/429 sources. It never pays or submits an inquiry. Transport/egress
policy must prevent private DNS resolution and rebinding; URL checks alone do not.

This discovers providers among installed, trusted sources. Unseeded web discovery,
independent identity enrollment and a populated public provider ecosystem remain
separate integration work. A downloaded key cannot establish its own trust.

## Signed records and state

Participant messages use `BRIARWOOD-INQUIRY/2`; provider offers use
`BRIARWOOD-LISTING/1`. They are executable versioned contracts and do not pretend
the older read-only Briarwood example is an operational service. Canonical JSON
bytes are signed as attached Ed25519 JWS. Key and exact endpoint pins are installed
by the holder. `src/crypto.mjs` exports signing, verification and digest helpers.
Payloads reject unsafe/non-JSON values, unknown fields, invalid times and sizes.

```text
awaiting_response -> accepted -> frozen -> paid -> awaiting_completion_ack -> closed
                  -> referred
                  -> declined
                             frozen -> payment_pending -> payment_unknown
                                                     -> paid (verified settlement)
```

Receipt delivery is a separate state throughout: `unconfirmed` or `confirmed`.
An HTTP success does not confirm it. Only a requester-signed receipt acknowledgment,
or the requester's signed terms consent binding that exact receipt, confirms it.
The receipt says the inquiry was recorded; it does not accept the work.

Persistence stores the exact inquiry, receipt and delivery obligation together.
Reusing an inquiry ID with changed content fails. An exact duplicate returns the
original historical receipt. Retries are explicit, bounded, persisted before
transport, exponentially delayed and stop at expiry. Exhaustion remains visibly
unconfirmed. Optional notifications have a separate outbox and bounded drain;
they never block returning the mandatory receipt.

Referral requests carry each prior provider's signed receipt and signed response.
Each hop binds the requester/task, previous chain, original inquiry, terms and
validated destination listing. Referral grants are scoped to a single inquiry
and expire. The host's authorization policy must validate actual contact and
disclosure authority; an authorization reference string is not a grant verifier.
The requester signs a new inquiry to consent to the new destination. A destination
performs its own checks. Hop count is bounded and loops/tampering are rejected.

The provider's acceptance and requester's freeze request bind the same terms
digest. The frozen record retains the full signed terms. Changed terms require a
new inquiry. Payment and completion stay bound to this agreement. Ambiguous
payments are reconciled by the original idempotency key; `pay` will not blindly
retry them. Historical settlement can be recorded after inquiry expiry without
authorizing a new payment. Completion needs checked effect evidence and a final
requester signature before the flow is closed.

## Required operator adapters

`createParticipant({identity,trust,listings,storeDir,clock,witness,authorize,
deliver,payment,completion,notify})` has no permissive production defaults.

| Adapter | Required behavior |
| --- | --- |
| `identity` / `trust` | Local signing identity `{id,kid,privateKey}` and independent `{participantId:{keys:{kid:publicJwk},endpoints:[...]}}` pins. Never load private keys from peer data. |
| `clock()` | A freshly verified current interval `{lower,upper}` in UTC. Use monotonic advancement of verified current-time evidence. A retained historical witness is not a clock. |
| `authorize(context)` | Return exactly `true` only after current owner scope, presenter/recipient checks, disclosure, revocation, constraints and spend policy allow this action. This is local policy, never a sender-supplied `proceed` field. |
| `witness.commit(binding)` / `.verify(evidence,binding)` | Produce and independently verify digest-bound time evidence. Verification returns `{valid,digest,previous_digest,id,lower,upper}`. The binding contains only a digest and predecessor digest, not private task bytes. |
| `deliver({endpoint,recipient_id,receipt,attempt})` | Send to the pinned endpoint under egress/timeout policy and return the requester's signed acknowledgment, not a transport status. |
| `payment.pay(intent)` / `.lookup(intent)` / `.verify(evidence,intent)` | Enforce provider payment authorization and a stable idempotency key transactionally in the actual payment system. Verify exact amount, currency/network, payee, parties, terms, frozen agreement and confirmed settlement. Lookup must never charge. |
| `completion.verify(evidence,binding)` | Independently check the expected result/effect against the frozen agreement and payment. Return true only for the intended effect. A provider assertion alone is insufficient. |
| `notify(event)` (optional) | Return true only for a confirmed additional notification. Drain via `retryNotification`; failure does not determine mandatory receipt state. |

`src/popcorn-witness.mjs` bridges the existing `popcornWitness` client and
`verifyPopcornWitnessEvidence` v2 verifier with pinned JWKS and an explicit
`authorizeSpend` gate. Construction and verification are free of network effects;
commit can purchase one witness. No uncertain purchase is automatically retried
inside that call. The host must persist spend reservations/reconciliation across
failed lifecycle retries. A sequence can purchase several witnesses, so give it
an explicit cumulative budget. Provider payment and witness fees are distinct.

The participant event's signed `previous_event_digest` is included in the
committed event digest. This is a participant event chain; it is not relabeled as
POPCORN's native `previous_attestation_digest` chain. Only digests/nonces go to
the witness. Witness signatures establish neither participant identity nor
recipient delivery, permission or work completion.

## Storage and operational limits

The file store serializes each inquiry across processes with exclusive lock
directories, syncs data, atomically renames records, and syncs the parent directory
where supported. It detects ordinary corruption with a checksum. It is not a
distributed database or protection from a party who can rewrite the entire store.
Node does not provide portable directory fsync on Windows: do not infer power-loss
atomicity there. A production payment adapter must enforce stable keys in its own
transactional system; a production deployment can replace the filesystem layer.

Process death can leave a lock. Inspect state and reconcile any external effect
before operator recovery; do not automatically remove locks or replay effects.
Unconfirmed inquiries stay visible for deliberate retry. Access control, key
rotation and revocation refresh, protected storage/backups, authenticated network
transport, current-time acquisition and an actual provider payment/effect backend
must be supplied for a live deployment. No live changes or charges are made by
the demo or test suite.

See [requirements and provenance](docs/requirements.md) for the recovered review
findings and their agent protocol translation.
