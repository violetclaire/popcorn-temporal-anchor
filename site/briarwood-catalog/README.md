# Briarwood: one address, a checkable handoff

A human or their agent publishes a profile at their own HTTPS address, then submits that address. Briarwood checks the declared shape, records only the name, one-line offer, address, exact card digest, and minimal history metadata in a public Git commit, and returns the evidence. Search returns the matching provider's current terms and contact or service instructions together. No account, installation, payment, GitHub login, or human approval queue is part of the visitor flow.

This is an **implementation candidate**, not a deployed estate or completed strike checker. The supplied preview has fictional profiles and an in-memory repository. No production card has been enrolled by this change. The default deployment config disables submissions and has no production routes or secrets. The versioned specification and all existing Workers remain untouched.

## Why this exists

GitHub discussion [1257](https://github.com/github/github-mcp-server/discussions/1257) distinguishes initial manual admission into GitHub's curated MCP catalog from later version synchronization. Briarwood controls its own automatic admission and evidence; it cannot grant admission into GitHub, configure someone else's client, or guarantee that ARD, NANDA, an A2A peer, or any search engine will index a listing. No third-party publisher is enrolled, contacted, or represented as a customer.

## Run and verify

Node.js 24; no npm install or runtime dependencies.

```text
node --test site/briarwood-catalog/card.test.mjs site/briarwood-catalog/repository.test.mjs site/briarwood-catalog/worker.test.mjs
node site/briarwood-catalog/preview.mjs
node site/briarwood-catalog/preview.mjs --export preview.html
```

The preview binds loopback only, uses PORT when supplied (otherwise 8777), and accepts only its two fictional card addresses. It never fetches their contact/service endpoints, makes payments, or writes GitHub. Every preview response states its demonstration status. The production handler uses the GitHub adapter; its tests simulate the fixed GitHub API, verify Git blob SHA-1 and exact document SHA-256, and exercise concurrency and ambiguous write outcomes.

## Routes

The proposed human prefix is `/catalog` on briarwood.ai; the matching agent prefix is `/briarwood/catalog` on 767-2676.com. These are candidate addresses until deployment is explicitly reported.

| Method | Suffix | Result |
| --- | --- | --- |
| GET/HEAD | empty | Entire active pointer catalog in initial green HTML; no links, scripts, controls, remote assets or hidden pagination |
| GET/HEAD | `.json` | Complete pointer snapshot, immutable commit and document hash |
| GET/HEAD | `/card-template.json` | Replaceable member-owned card template; `.example` addresses deliberately do not submit |
| POST | `/submissions` | One JSON field, `card_url`; card fetched, mechanically checked, then public commit/readback |
| GET/HEAD | `/status?card_url=...` | `listed`, `not_listed`, `withdrawn` or `suspended`, with exact commit evidence |
| GET/HEAD | `/search?q=...` | Deterministic task-word filtering, in listing order, with current card declarations or explicit source errors |

### Human/agent card profile

`briarwood-card/1` is the versioned JSON implementation profile derived from the ruled five card fields, not a claim that these JSON property names appeared verbatim in the specification. See the endpoint template or `exampleCard` in `worker.mjs`.

- Explicit publisher opt-in is in the **fetched** file: `catalog: "https://briarwood.ai/catalog"`, `listed: true`. A caller cannot add that consent in a submission. `listed: false` at the same address withdraws on resubmission.
- Required: name, one-line task offer, canonical card address; scope/time/cost/consequences/decision; witness verification route and trusted public-key references (or explicit limitations if none).
- At least `contact` or `service`. A human artist/planner can provide a request address and instructions without any MCP software. An agent endpoint supplies transport, endpoint or package, authentication, and instructions.
- A member signing key is optional. No key means no member-bound strikes; it is not a listing refusal.
- Service/contact instructions remain untrusted provider data. Reading does not execute them, install packages, book, settle, or grant authorization.
- Availability, deadlines, prices, quantities, budgets and outcomes are returned as provider declarations. This first build filters the words in **name and offer**, not live calendars, semantic vectors, numeric prices or location radii. More than twenty matches returns an explicit request to narrow the query, never an undisclosed truncation.

### Checkable publication and failure states

```text
card_url → public card bytes → validate → SHA-256 → read public pointers at commit
         → compare-and-swap GitHub file → read exact new commit → acknowledgment
search   → same pointer snapshot → match in listing order → fetch pinned card
         → declarations together, or changed / withdrawn / unavailable
```

Only a successful commit readback produces a new `listed` response. The acknowledgment contains the exact card digest, byte count, public commit, immutable pointer document, and search/status addresses. Duplicate URL+digest submissions do not create more entries or commits. Updates preserve listing order. Withdrawals preserve history. A lost PUT response gets read-only reconciliation; an unresolved outcome is `publication_unconfirmed`, not “failed with no possible write” or a fictitious receipt. Conflicts re-read/rebase at most three times; other concurrent entries are preserved.

An acknowledgment is free catalog evidence, **not a paid signed POPCORN receipt**, an identity verification, an independently witnessed time, or proof of executed work. `listed_at` and `updated_at` currently carry server card-observation times. Future evidence/strike logic must obtain actual version boundaries from the public Git commit records, not treat these convenience timestamps as independently witnessed publication times.

The source card stays with its provider. Only pointer metadata is retained. Current full card terms/contacts are read transiently and are not persisted or cached. Card drift is reported and requires resubmission to pin a new version. A failed repository read is an error, not an empty catalog. A failed source read remains visible as a matching pointer with unavailable evidence. A missing source does not automatically accuse a member or erase history.

## Deployment prerequisites

1. Preserve the existing versioned specification and existing production routes. Report/obtain the established live acceptance for the staged catalog steps; local tests are not Scout's independent acceptance.
2. Create a dedicated **public pointers-only repository**, configured here as `violetclaire/briarwood-pointers`, with the initial `pointers.json` from this folder. A new runtime credential needs access only to that repository. The code repository need not be writable by the service.
3. Configure `CATALOG_GITHUB_TOKEN` as a dedicated fine-grained GitHub secret scoped to **Contents read/write on that one pointers repository**. GitHub does not support path-scoping this permission. Never copy the user's broad CLI credential into a hosted Worker. The public read/write paths, owner, repo and branch are fixed operator configuration, never visitor inputs. API credentials are sent only to api.github.com; redirects are refused.
4. Use the Cloudflare Worker runtime with `global_fetch_strictly_public` and **no private-network, VPC or service bindings**. The fetcher rejects private/reserved/numeric hostnames, redirects, credentials, invalid UTF-8/content types, oversized bodies and deadlines. Optional DNS preflight is available for a separately tested adapter; it is not DNS pinning and must never be advertised as such. Do not deploy the generic fetch helper onto a private-network-capable Node server without a resolver-pinned or equivalently restricted outbound transport.
5. Configure an intake rate-limit binding (`INTAKE_RATE_LIMITER`) and edge limits for read/search endpoints, plus suitable GitHub quota/budget monitoring. Bound bodies and retries do not provide total abuse protection. Public routes must not be enabled without deployment review of outbound policy and rate limits.
6. Stage with `PUBLIC_INTAKE_ENABLED: "false"`, test GET/HEAD/error/CORS/byte preservation, then test a clearly separate owned acceptance card/repository end to end. Preserve POPCORN's reserved first-resident order. Enable real public intake only after the commit-to-served-catalog check succeeds. No paid tests are needed.

The shipped config intentionally has no routes and no secret. Its pointers repository is a proposed deployment target, not evidence that it exists or has been initialized.

## Boundaries and next increments

The signed-act strike checker and witnessed return path are not implemented here. Suspended pointers are preserved and cannot re-enter through ordinary submission. Historical card bytes must come from the parties and be checked against pinned digests; do not quietly turn the catalog into a full-card archive. Paid receipts remain the existing POPCORN service.

Automatic schedule/budget matching needs explicit structured units/time-zone rules, current provider availability, and the provider's consent to any calendar integration. A2A/MCP/ARD/NANDA-specific discovery adapters need their own conformance tests. Neither is implied by a successful listing. First make the direct, readable profile-to-request handoff work.
