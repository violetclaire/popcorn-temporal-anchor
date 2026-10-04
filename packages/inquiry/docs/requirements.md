# Agent inquiry requirements and provenance

This package implements a participant-local agent inquiry flow. The acceptance
criteria below describe the required behavior; they are not a production
deployment, payment-settlement, external delivery, or independent time-verification
claim. Local tests and adapters must identify what they actually verify.

The intended flow is **discover providers → inspect terms → submit inquiry →
verify receipt → accept, refer, or decline → agree exact terms → pay → complete**.
Every transition retains its signer, scope, version, evidence, and unresolved
conditions. Agents can use structured interfaces without a wedding form or human
dashboard.

## Where the requirements came from

The October 3, 2026 review record contains several kinds of evidence. The source
distinctions matter: a requested confirmation feature does not itself specify a
cryptographic protocol, and a passing email test does not prove inbox delivery.

| Source | What it establishes | Agent requirement derived from it |
| --- | --- | --- |
| Stuart's annotations on “Edit Session Form,” confirmed by the owner | Submission confirmation is “Must have”; the post-submission message says “Make sure this works”; other notifications are “Nice to have.” Screenshots document priorities, not successful execution. | Mandatory, checkable submission acknowledgment and an accurate machine-readable result. Additional notifications are optional. |
| Replit DateInquiry review excerpt, `server/emailService.ts:121` in the reviewed build | Confirmation failure can leave a saved inquiry without confirmation; malformed names can break email preparation before its error handler. | Validate before persistence/signing; retain a durable receipt-delivery obligation until verified acknowledgment or an explicit unresolved outcome. |
| Same review, `server/routes.ts:17898` in the reviewed build | External redirect forms discard email-send status and accept an unvalidated redirect destination. | Every transport preserves acknowledgment state. Destination identity and allowed endpoint must be checked before referral or delivery. |
| Same review's positive and unresolved checks | Three public endpoints attempted confirmation; thank-you messages appeared; confirmations did not promise a booking. Three tests passed. Current publication and actual inbox arrival were unverified. | Receipt of inquiry, transport acceptance, requester acknowledgment, provider acceptance, and completion are separate facts. |
| Owner's protocol translation, October 3, 2026 | Signed receipts, no silent drops, boundary validation, witnessed responses, referral continuity, terms before inquiry, frozen terms, payment, and completion apply to agents. | Build the complete agent flow; these extensions are not claims about what the form screenshots alone specified. |
| Earlier participant-local blueprint and authority prototypes; source locators below | Local custody, signed scoped messages, bounded retries, explicit disclosure permission, receiver policy, and exact object/version binding were already intended. | Preserve these boundaries while adding operational discovery and lifecycle behavior. |

The submission that exposed the review findings was a gibberish test with a May
1970 event date, not a real client case. Semantic nonsense and schema-invalid data
are different conditions: whether a particular name or date is invalid depends
on the declared schema and policy. Tests must not infer a real client's identity,
intent, consent, or booking from that fixture.

### Source locators

These are provenance references, not runtime imports. The DateInquiry line
numbers refer to the reviewed snapshot, not this repository. Historical research
artifacts below use paths relative to their archived research workspace; they
are not shipped by this package. No private architecture text or client records
are required to run it.

- Replit excerpt: “Review DateInquiry fixes,” original review supplied by the
  owner; `server/emailService.ts:121` and `server/routes.ts:17898`.
- Form annotations: “Form Requirements Review,” October 3, 2026; image reading
  and owner confirmation. Smaller screenshot text was not reliably readable.
- `outputs/fact-check/briarwood-agent.json`: `BRIARWOOD-AGENT/1.0`, blueprint
  version `1.1.0`; participant-local storage and bounded retry contract.
- `outputs/fact-check/briarwood-inquiry.schema.json`:
  `BRIARWOOD-INQUIRY/1.0`, including `x-briarwood-contract` assertion and semantic
  validation rules. Its example was explicitly non-operational with placeholder
  signatures.
- `work/briarwood-discovery-launch/README.md`: local static-page stage.
  `launch.html:143–145` describes a proposed participant listing;
  `launch.html:180–192` describes routing and conditions before action.
- `work/beauvette-agreement-revisions/docs/BRIARWOOD_OPERATING_LOGIC.md`, §6b:
  explicitly requested find/verify actions and partial contact readiness.
- `work/briarwood-core/docs/grant.md` and `docs/receiver.md`: pinned issuer keys,
  grant scope, separate presenter authentication, receiver consent, idempotency,
  and uncertain-effect reconciliation in local prototypes.
- Current repository references: [witness layer](../../../docs/witness-layer.md),
  [historical protocol and current-route note](../../../docs/WITNESS_PROTOCOL.md),
  and [service description](../../../README.md). These describe the current
  `POPCORN-WITNESS/2.0` purchase path, `POST /v2/receipt`, while retaining original
  1.0 receipts and their verification contract. Reading these files does not
  establish current endpoint availability.

## Acceptance criteria

| ID | Required behavior | Evidence needed to accept it |
| --- | --- | --- |
| A1 — Discovery | An agent explicitly queries participant-owned listings by needed capability. Results expose participant identity, capability, conditions, exact terms, endpoint, and evidence limitations before inquiry. Unknown, stale, or unverifiable candidates do not become validated destinations. | Successful and unsuccessful queries; rejection of changed, expired, or incorrectly signed listings; terms available without inquiry submission. |
| A2 — Identity and scope | Verify participant signatures against a locally accepted, pinned identity/key binding. Validate signer, intended recipient, message type, inquiry identity, version, validity interval, and exact canonical bytes. A supplied public key or endpoint cannot vouch for itself. | Wrong-key, wrong-party, tamper, stale-message, replay, and cross-inquiry tests. Keep participant signatures separate from temporal witness evidence. |
| A3 — Boundary validation | Reject unsupported fields, wrong types, invalid windows, oversized or malformed payloads, and invalid destinations before saving an inquiry or minting its receipt. Declared policy handles semantically unsuitable requests. | Rejection leaves no accepted inquiry or receipt; deterministic errors do not crash the participant. Valid unusual names are not rejected merely for looking unfamiliar. |
| A4 — Mandatory receipt | Persist the accepted inquiry and its signed receipt/delivery obligation durably. The receipt binds the exact inquiry and provider, and acknowledges receipt only. The requester verifies and signs an acknowledgment binding that exact receipt. | Restart recovery; exact receipt verification; missing, forged, wrong-requester, and wrong-receipt acknowledgments remain unconfirmed. Provider willingness is a separate signed response. |
| A5 — Open delivery loop | Preserve pending, attempted, acknowledged, and unconfirmed outcomes. Persist bounded retry state and retry the same receipt, not a new inquiry or business effect. Exhaustion or expiry remains visibly unresolved. | Failure, restart, duplicate delivery, lost acknowledgment, retry-limit, and deadline tests. Transport success alone must not close the loop. |
| A6 — Response and time | The provider signs accept, refer, or decline against the inquiry and current terms. Retain response timestamps and their evidence basis. A trusted external time claim requires verified witness evidence; a local fixture clock stays labeled local. | Response binding, deadline, uncertainty, and stale-response cases. Measured elapsed response time must identify its start/end evidence and must not imply a guaranteed service level. |
| A7 — Referral continuity | A signed referral binds the source inquiry, originating participant, validated destination, allowed disclosure, expiry, and prior verifiable chain. The new destination applies its own checks and accepts or declines. | Tampered, unauthorized, expired, wrong-destination, and discontinuous chains rejected; permitted referral preserves earlier receipts and unresolved conditions. Contact or referral does not imply consent. |
| A8 — Frozen agreement | Both parties sign the same exact terms digest for this inquiry, including parties, action, price/currency/payee where applicable, scope, version, and expiry. Changes create a new revision and invalidate dependent permission. | Mismatched, unilateral, stale, or substituted terms cannot authorize payment or completion. Both signatures independently verify against the same digest. |
| A9 — Payment evidence | Payment authorization covers the frozen agreement and exact intended transfer. A payment adapter's checked evidence binds the agreement digest, parties/payee, amount, currency, transaction identity, and confirmed outcome. Pending or ambiguous results remain unresolved. | Mismatched terms/payee/amount, duplicate operation, and unknown settlement cases. A demo adapter proves only its simulated effect; a real settlement claim needs evidence from the real payment system. |
| A10 — Completion | Completion is a signed receiver decision about the agreed work and its actual effect evidence. It remains distinct from a provider's claim of delivery, a payment receipt, and the original inquiry receipt. | Receiver identity, agreement digest, payment requirement, effect reference, and transition verified; unauthorized or premature completion rejected; duplicate requests cause no second effect. |
| A11 — Optional notifications | Extra alerts may supplement the required receipt protocol and must disclose their own delivery outcome. | The mandatory acknowledgment path works with optional notifications disabled or failing. |

## Compatibility and production integration

The historical blueprint has no central inquiry, availability, schedule, referral,
or trust registry. It is a design input, not proof that an agent flow is already
operational. Discovery here operates over participant-held data. It must not
publish private networks, manufacture endorsements, or silently expand into a
global router. External search is an explicit adapter action; a successful local
query is not evidence of organic discovery through public search engines.

POPCORN witnesses a digest commitment and its stated time interval. It does not
authenticate the requester, prove delivery, accept a job, grant permission, or
prove execution. The agent retains the original bytes and checks the relevant
receipt version, expected digest, nonce, predecessor, key trust, and replay
policy. A historical digest receipt is not fresh authorization.

Before production use, provide durable participant storage, authenticated
transport, accepted participant keys and rotation/revocation policy, trusted
current-time checks, receiver-side enforcement, and payment/effect adapters with
reconciliation. Couple an external effect to durable idempotency or a
transactional outbox; after an ambiguous outcome, reconcile before repeating the
effect. Use a deployment-specific verification record for real network delivery,
live settlement, operational endpoints, and independent time witnesses. Passing
the local package tests establishes only the behavior exercised by those tests.
