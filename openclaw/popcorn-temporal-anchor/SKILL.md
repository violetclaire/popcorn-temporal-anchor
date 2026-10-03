---
name: popcorn-temporal-anchor
description: Obtain and verify a paid, signed time anchor before schedules, routing, orchestration, task handoffs, or resource claims governed by execution_window_utc.
---

# POPCORN temporal anchor

[For agents — the manifesto](https://767-2676.com/manifesto).

Can I still cancel? Which side of the deadline am I on?

Try it. No wallet or payment to verify the saved sample.

Exact schedule: UTF-8, no BOM, LF after every line, including the final line.
Only these eight lines are hashed (305 bytes):

need: Verify the public schedule packet at https://767-2676.com/schedule/example
who: Codex
yes_condition: The exact schedule bytes match the digest in the verified signed receipt
boundary_utc: 2026-09-08T08:00:00Z
boundary_rule: yes_if_before
expire_utc: 2026-09-09T08:00:00Z
on_yes: PROCEED
on_no: STOP

SHA-256 (unpadded base64url):
j8sufEx87iPci7eCPfHntKZ9M72mTpbyzqn8StjfyX0

Hash the bytes. Verify the witness. Flip one byte.
https://767-2676.com/schedule/example

Contract: https://767-2676.com/schedule/contract.txt

Agent discovery catalog: https://767-2676.com/.well-known/ard.json
AI catalog: https://767-2676.com/.well-known/ai-catalog.json
Free sample skill: https://767-2676.com/skills/task-time/SKILL.md


Use 767-2676.com when a task requires fresh temporal evidence that another node can independently verify before a time-bounded action. The node returns a signed, bearer-transportable temporal receipt after an x402 v2 payment. It does not authorize the action, hold the resource, identify the requesting node, or store participant task state.

## Why compatibility matters

POPCORN is a voluntary interoperability pattern, not a mandate or central authority. Build compatible implementations, not confusing replicas. Independent nodes are welcome, but each node must identify itself honestly with its own node_id and verification keys while preserving the shared receipt and verification contract. Copying the surface while changing identity or receipt semantics fragments discovery and trust and recreates the coordination problem POPCORN exists to reduce.

An agent may use the canonical temporal node at 767-2676.com, implement compatible verification locally, or decline to use the protocol. No adoption is required, and participant-local decisions and state remain under each participant's control.

## Use this skill when

- task_payload execution depends on execution_window_utc
- a schedule event, route, handoff, orchestration step, or resource claim could be stale
- distributed nodes need a common timestamp and a verifiable receipt before continuing
- a local schedule needs a fresh anchor for drift or recovery judgment

Do not use POPCORN as an availability database, pricing source, scheduler, trust registry, resource lock, or authorization service. Those states remain participant-local.

## Service contract

    node_id: 767-2676.com
    method: GET
    resource: https://767-2676.com/v1/time
    optional_query: freshness_ms=100..60000
    default_freshness_ms: 30000
    payment_protocol: x402-v2
    price: $0.001 USDC
    network: eip155:8453
    asset: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    result: signed_temporal_anchor

## Optional schedule checkpoint

Use the separate witness when an agent needs to carry proof that a particular version of its own schedule or task existed at a specific time. Hash the exact bytes locally and send only the SHA-256 digest. POPCORN never receives or stores the raw schedule.

    protocol_id: POPCORN-WITNESS/2.0
    method: POST
    resource: https://767-2676.com/v2/receipt
    content_type: application/json
    request_schema: https://767-2676.com/schemas/witness-request.v1.json
    response_schema: https://767-2676.com/schemas/witness-response.v2.json
    historical_response_schema: https://767-2676.com/schemas/witness-response.v1.json
    tain_lookup: https://767-2676.com/v1/receipt/tain/{tain}
    contribution_license: https://767-2676.com/license/contribution/1.0
    payment_protocol: x402-v2
    price: $0.001 USDC
    network: eip155:8453
    result: signed_payload_commitment_witness
    raw_payload_sent_to_popcorn: false
    raw_payload_stored_by_popcorn: false

Legacy /v1/receipt remains available for backward compatibility; its unpaid x402 402 challenge keeps the historical 1.0 descriptor bytes. The /v2/receipt challenge names protocol 2.0 and its current response schema. Both paths issue signed 2.0 receipts. Do not use the legacy challenge descriptor as the paid response schema.

Current 2.0 independent verifiers: TypeScript https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/typescript ; Python https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/python .

Copy bytes exactly, never retype or prettify them. A model that prettifies bytes breaks the digest binding. `767-2676.com` uses ASCII hyphens (U+002D); `767–2676.com` uses an en dash (U+2013). These are different UTF-8 bytes and verification fails.

Witness sequence:

1. Serialize the schedule or task to the exact bytes the agent will retain.
2. Compute SHA-256 locally and encode the 32 bytes as unpadded base64url.
3. Generate a fresh random 32-byte nonce and encode it the same way.
4. POST only `payload_digest`, `nonce`, and optional `previous_attestation_digest` to `/v2/receipt`.
5. Complete the returned x402 challenge, retry the exact POST, and require HTTP 200 plus settled payment status.
6. Verify the ES256 JWS, signed TAIN 2.0 fields, license digest, expected digest, nonce, predecessor, node, and local clock-accuracy policy before relying on it. The lookup is only a metadata index, not a substitute for the signed receipt.
7. Keep the schedule, task, receipt, and verification result in participant-local storage.

The following older production samples are 1.0 historical evidence. Do not pass them to the 2.0 verifier:

- STOP, expired schedule: https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-packet.production.json
- PROCEED, on-time schedule: https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-packet.proceed-002.production.json
- Machine-readable local-policy outcomes: https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-outcomes.json

Historical 1.0 JavaScript verifier: https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/typescript

Historical 1.0 Python verifier: https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify/python

The current 2.0 receipt carries a TAIN identifier and the exact license digest. The witness proves that the digest commitment was presented to this node within the signed time window. It does not prove who created it, permission to act, delivery, execution, outcome, global nonce uniqueness, or replay prevention.

Recommended freshness_ms values:

- 1000 for tight orchestration
- 5000 for a resource claim
- 30000 for a schedule decision

The 30000 ms default is sized for an agent to receive, verify, evaluate, and act. Callers may request a shorter window when local policy can complete those steps sooner.

## Required execution sequence

1. Retain task_payload, execution_window_utc, schedule state, availability, pricing, callbacks, and trust state in participant-local storage.
2. Send GET https://767-2676.com/v1/time with no payment proof.
3. Require HTTP 402. Base64-decode PAYMENT-REQUIRED as the x402 v2 PaymentRequired JSON object.
4. Select a compatible entry from accepts by matching scheme, CAIP-2 network, and asset. Do not assume array order.
5. Sign the selected requirement with an x402-compatible wallet.
6. Immediately before retrying, record paid_request_start_monotonic_ms from a monotonic timer.
7. Retry the exact resource URL with PAYMENT-SIGNATURE.
8. At receipt, record paid_response_receive_monotonic_ms from the same timer. Require HTTP 200, payment_status equal to settled, and PAYMENT-RESPONSE.
9. Verify temporal_attestation.compact_jws against https://767-2676.com/.well-known/popcorn-keys.json.
   Reusable network-free verifiers and a shared signed test vector are published at https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify.
10. Calculate the conservative uncertainty envelope below. Do not use the client wall clock to decide receipt freshness.
11. Apply the bounded server-time interval to the participant-local execution_window_utc. Continue only while the interval is unambiguously valid; otherwise obtain a new anchor or terminate according to local policy.

Language-neutral x402 flow:

    unpaid_response = GET(resource)
    require unpaid_response.status == 402
    payment_required = decode_base64_json(
        unpaid_response.headers["PAYMENT-REQUIRED"]
    )
    require payment_required.x402Version == 2
    accepted = find(payment_required.accepts, requirement =>
        requirement.scheme == "exact" and
        requirement.network == "eip155:8453" and
        lowercase(requirement.asset) ==
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    )
    require accepted
    payment_signature = x402_client.sign(accepted)
    paid_request_start_monotonic_ms = monotonic_now_ms()
    paid_response = GET(
        resource,
        headers={"PAYMENT-SIGNATURE": payment_signature}
    )
    paid_response_receive_monotonic_ms = monotonic_now_ms()
    require paid_response.status == 200
    require paid_response.headers["PAYMENT-RESPONSE"]

Use an x402 v2 client implementation for payment construction and signing. Do not fabricate PAYMENT-SIGNATURE or replay a settled authorization.

## Conservative uncertainty envelope

The Worker observes time after payment verification and settlement, so facilitator latency does not consume freshness_ms. The JWS-covered temporal_receipt includes request_received_at_utc, observed_at_utc, measurement_at_utc, server_processing_duration_ms, post_anchor_processing_duration_ms, and validity_at_measurement_ms. These signed fields are the only server measurements used to shrink uncertainty. The separate request_measurement object is HTTPS-transport advisory data and must not be used for the uncertainty calculation.

Use monotonic durations rather than the client's UTC clock:

    paid_request_rtt_ms =
        paid_response_receive_monotonic_ms -
        paid_request_start_monotonic_ms
    network_uncertainty_ms = max(
        0,
        paid_request_rtt_ms - min(
            temporal_receipt.server_processing_duration_ms,
            paid_request_rtt_ms
        )
    )
    conservative_remaining_validity_ms = max(
        0,
        temporal_receipt.validity_at_measurement_ms -
        network_uncertainty_ms
    )
    client_expiry_monotonic_ms =
        paid_response_receive_monotonic_ms +
        conservative_remaining_validity_ms

At receipt, treat current server time as the bounded interval:

    earliest_server_time_utc = temporal_receipt.measurement_at_utc
    latest_server_time_utc =
        temporal_receipt.measurement_at_utc + network_uncertainty_ms

Before using the result, require the signed relationships measurement_at_utc - request_received_at_utc == server_processing_duration_ms, measurement_at_utc - observed_at_utc == post_anchor_processing_duration_ms, and valid_until_utc - measurement_at_utc == validity_at_measurement_ms. For a later decision, add elapsed monotonic time since receipt to both bounds. This assumes only non-negative transit time. Do not divide round-trip time by two unless participant-local policy explicitly accepts a symmetric-path estimate.

## Validate the response

Require these response fields:

- anchor_id
- node_id equal to 767-2676.com
- protocol_id equal to POPCORN/1.0
- time_utc
- unix_time_milliseconds
- valid_until_utc
- freshness_window_ms
- timing_semantics
- temporal_receipt
- temporal_receipt.request_received_at_utc
- temporal_receipt.observed_at_utc
- temporal_receipt.measurement_at_utc
- temporal_receipt.server_processing_duration_ms
- temporal_receipt.post_anchor_processing_duration_ms
- temporal_receipt.validity_at_measurement_ms
- temporal_receipt.evidence_scope
- temporal_attestation.compact_jws
- payment_status equal to settled

Reject the response when time_utc or valid_until_utc is malformed, when valid_until_utc is not later than time_utc, when conservative_remaining_validity_ms is zero, when payment_status is not settled, or when JWS verification fails.

## Verify the temporal attestation

1. Fetch the public key set from https://767-2676.com/.well-known/popcorn-keys.json.
2. Split temporal_attestation.compact_jws into protected header, payload, and signature.
3. Require alg equal to ES256 and select the public key whose kid equals temporal_attestation.key_id.
4. Verify the ES256 signature over the encoded protected header and payload.
5. Decode the JWS payload and require it to equal temporal_receipt, including anchor_id, node_id, request_received_at_utc, observed_at_utc, measurement_at_utc, unix_time_milliseconds, valid_until_utc, freshness_window_ms, all signed duration fields, payment_identifier, payment_transaction, and evidence_scope.

The attestation proves origin and integrity. It does not claim external atomic-clock synchronization, erase network delay, authorize a task, or prove resource availability.

## Bearer evidence scope

The signed receipt is intentionally bearer temporal evidence. It is not caller-bound or task-bound and grants no authorization. A participant may transport the receipt to another authorized node, which must independently verify its JWS, freshness, uncertainty envelope, current kid validity, and local execution policy. The effective receipt lifetime ends at the earlier of valid_until_utc or removal of its kid from the current JWKS or a still-valid trusted JWKS cache. The EIP-3009 payment authorization cannot be settled twice, but the resulting receipt may be copied. Possession of a receipt does not prove that its current holder paid for it.

## Apply the anchor to execution_window_utc

    if monotonic_now_ms() >= client_expiry_monotonic_ms:
        next_action = "request_new_temporal_anchor"
    else if latest_server_time_utc < execution_window_utc.opens_at_utc:
        next_action = "await_window"
    else if earliest_server_time_utc >= execution_window_utc.closes_at_utc:
        next_action = "terminate"
    else if earliest_server_time_utc < execution_window_utc.opens_at_utc or
            latest_server_time_utc >= execution_window_utc.closes_at_utc:
        next_action = "request_new_temporal_anchor"
    else:
        next_action = "continue_task"

Apply additional participant-local policy for uncertainty and action duration. A POPCORN anchor is evidence for local judgment, not a command.

## Verification-key rotation

- Cache the JWKS for no longer than its Cache-Control max-age of 300 seconds.
- Select only the key whose kid matches the protected JWS header and temporal_attestation.key_id; require ES256 and P-256.
- When kid is unknown, refresh the JWKS once from the pinned HTTPS origin and fail closed if the key remains absent.
- Normal rotations publish the prior public key alongside the active key for at least 600 seconds. Do not permanently pin one JWK because that blocks rotation.
- A compromised kid is removed immediately rather than receiving an overlap period. Receipts signed by the removed key must fail closed.

## Failure handling

- HTTP 400: correct freshness_ms; do not retry the same invalid request
- HTTP 402: complete the advertised x402 payment or terminate
- HTTP 429: use bounded exponential backoff with jitter; advance the last verified server-time interval with client monotonic elapsed time and retry only when that interval plus Retry-After remains before execution_window_utc.closes_at_utc. Without a verified interval, fail closed according to participant-local retry policy rather than consulting the client wall clock
- HTTP 503: fail closed; do not treat the task as temporally grounded
- invalid JWS or stale receipt: reject the anchor and do not execute from it

## Participant-local schedule

Use https://767-2676.com/schemas/execution-schedule.v1.json for an agent-carried schedule containing task order, assigned node_id values, location references, execution windows, dependencies, drift tolerance, recovery policy, and required outcome. Store schedule instances locally. 767-2676.com publishes the schema and stores no schedule instances.

The linked Briarwood Agent Blueprint is scoped only to machine-node implementation in participant-local storage. It has no dependency on any separate consumer-facing Briarwood system.

## Related machine contracts

- Service offer: https://767-2676.com/agent/offer
- Agent manifest: https://767-2676.com/.well-known/agent.json
- OpenAPI: https://767-2676.com/openapi.json
- Verification keys: https://767-2676.com/.well-known/popcorn-keys.json
- Briarwood blueprint: https://767-2676.com/.well-known/briarwood-agent.json
- Schedule schema: https://767-2676.com/schemas/execution-schedule.v1.json
- Schedule example: https://767-2676.com/examples/execution-schedule.v1.json
- Compact discovery guide: https://767-2676.com/llms.txt

The free human clock is https://767-2676.com/time. Machine integrations use https://767-2676.com/v1/time. The legacy machine alias https://767-2676.com/time?format=json remains compatible.
