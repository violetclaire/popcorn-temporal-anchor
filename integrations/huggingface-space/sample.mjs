// POPCORN free historical sample. Node 20+; no wallet or network calls.
// Bundles the maintained verifier and public sample evidence.
const encoder = new TextEncoder();
function decodeBase64Url(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error("compact JWS contains invalid base64url");
    }
    const decoded = Buffer.from(value, "base64url");
    const copy = new Uint8Array(new ArrayBuffer(decoded.length));
    copy.set(decoded);
    return copy;
}
function parseJsonPart(value, label) {
    try {
        return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch  {
        throw new Error(`${label} is not valid base64url JSON`);
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireExactKeys(value, expected, label) {
    const actualKeys = Object.keys(value).sort();
    const expectedKeys = [
        ...expected
    ].sort();
    if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index)=>key !== expectedKeys[index])) {
        throw new Error(`${label} contains missing or unsupported fields`);
    }
}
function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (isRecord(value)) {
        return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
function encodeBase64Url(value) {
    return Buffer.from(value).toString("base64url");
}
async function sha256Base64Url(value) {
    const input = typeof value === "string" ? encoder.encode(value) : value;
    const bytes = new Uint8Array(new ArrayBuffer(input.byteLength));
    bytes.set(input);
    return encodeBase64Url(await crypto.subtle.digest("SHA-256", bytes));
}
export async function digestWitnessSignedPayload(compactJws) {
    if (typeof compactJws !== "string") {
        throw new Error("compact_jws is missing");
    }
    const parts = compactJws.split(".");
    if (parts.length !== 3 || parts.some((part)=>part.length === 0)) {
        throw new Error("compact_jws must contain exactly three parts");
    }
    const payloadBytes = decodeBase64Url(parts[1]);
    if (Buffer.from(payloadBytes).toString("base64url") !== parts[1]) {
        throw new Error("compact JWS signed payload is not canonical base64url");
    }
    return sha256Base64Url(payloadBytes);
}
function requireSha256Digest(value, label) {
    if (!isRecord(value) || value.algorithm !== "sha-256" || typeof value.value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.value)) {
        throw new Error(`${label} must be an unpadded base64url SHA-256 digest`);
    }
    requireExactKeys(value, [
        "algorithm",
        "value"
    ], label);
}
function requireNonce(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
        throw new Error("nonce must be 32 unpadded base64url bytes");
    }
}
function requireFinite(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a finite non-negative number`);
    }
}
function parseUtc(value, label) {
    if (typeof value !== "string" || !value.endsWith("Z")) {
        throw new Error(`${label} must be an explicit UTC timestamp`);
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
    return parsed;
}
export function evaluateWitnessAgainstSchedule(witnessWindowUtc, executionWindowUtc) {
    const witnessEarliestMs = parseUtc(witnessWindowUtc.earliest, "witness_window_utc.earliest");
    const witnessLatestMs = parseUtc(witnessWindowUtc.latest, "witness_window_utc.latest");
    if (witnessEarliestMs > witnessLatestMs) {
        throw new Error("witness_window_utc is not ordered");
    }
    const opensMs = parseUtc(executionWindowUtc.opens_at, "execution_window_utc.opens_at");
    const closesMs = parseUtc(executionWindowUtc.closes_at, "execution_window_utc.closes_at");
    if (opensMs >= closesMs) {
        throw new Error("execution_window_utc is not ordered");
    }
    let decision;
    let reason;
    if (witnessLatestMs < opensMs) {
        decision = "STOP";
        reason = "witness_window_entirely_before_execution_window";
    } else if (witnessEarliestMs > closesMs) {
        decision = "STOP";
        reason = "witness_window_entirely_after_execution_window";
    } else if (witnessEarliestMs >= opensMs && witnessLatestMs <= closesMs) {
        decision = "TIME_CHECK_PASSED";
        reason = "witness_window_entirely_inside_execution_window";
    } else {
        decision = "RECHECK";
        reason = "witness_uncertainty_crosses_execution_boundary";
    }
    return {
        decision,
        authorization_granted: false,
        reason,
        witness_window_utc: {
            earliest: witnessWindowUtc.earliest,
            latest: witnessWindowUtc.latest
        },
        execution_window_utc: {
            opens_at: executionWindowUtc.opens_at,
            closes_at: executionWindowUtc.closes_at
        }
    };
}
function requireIntegerRelationship(actual, expected, label) {
    if (!Number.isSafeInteger(expected) || expected < 0 || actual !== expected) {
        throw new Error(`${label} signed relationship is invalid`);
    }
}
function validateReceiptSemantics(receipt, expectedNodeId) {
    if (receipt.node_id !== expectedNodeId) throw new Error("unexpected node_id");
    if (receipt.protocol_id !== "POPCORN/1.0") throw new Error("unexpected protocol_id");
    if (!receipt.anchor_id || !receipt.payment_identifier) {
        throw new Error("receipt identifiers are missing");
    }
    const requestReceivedMs = parseUtc(receipt.request_received_at_utc, "request_received_at_utc");
    const observedMs = parseUtc(receipt.observed_at_utc, "observed_at_utc");
    const measurementMs = parseUtc(receipt.measurement_at_utc, "measurement_at_utc");
    const validUntilMs = parseUtc(receipt.valid_until_utc, "valid_until_utc");
    requireIntegerRelationship(measurementMs - requestReceivedMs, receipt.server_processing_duration_ms, "server_processing_duration_ms");
    requireIntegerRelationship(measurementMs - observedMs, receipt.post_anchor_processing_duration_ms, "post_anchor_processing_duration_ms");
    requireIntegerRelationship(validUntilMs - measurementMs, receipt.validity_at_measurement_ms, "validity_at_measurement_ms");
    requireIntegerRelationship(validUntilMs - observedMs, receipt.freshness_window_ms, "freshness_window_ms");
    if (receipt.unix_time_milliseconds !== observedMs) {
        throw new Error("unix_time_milliseconds signed relationship is invalid");
    }
    if (receipt.evidence_scope?.type !== "bearer_temporal_evidence" || receipt.evidence_scope.caller_bound !== false || receipt.evidence_scope.task_bound !== false || receipt.evidence_scope.authorization_granted !== false) {
        throw new Error("temporal evidence must be bearer, non-authorizing, and unbound");
    }
    return {
        measurementMs,
        validUntilMs
    };
}
export async function verifyPopcornTemporalEvidence(response, jwks, monotonic, options = {}) {
    if (!isRecord(response) || !isRecord(response.temporal_receipt)) {
        throw new Error("response is missing temporal_receipt");
    }
    if (!isRecord(response.temporal_attestation)) {
        throw new Error("response is missing temporal_attestation");
    }
    const compact = response.temporal_attestation.compact_jws;
    if (typeof compact !== "string") throw new Error("compact_jws is missing");
    const parts = compact.split(".");
    if (parts.length !== 3 || parts.some((part)=>part.length === 0)) {
        throw new Error("compact_jws must contain exactly three parts");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJsonPart(encodedHeader, "protected header");
    if (!isRecord(header) || header.alg !== "ES256" || typeof header.kid !== "string") {
        throw new Error("protected header must contain alg=ES256 and kid");
    }
    if (response.temporal_attestation.algorithm !== undefined && response.temporal_attestation.algorithm !== "ES256") {
        throw new Error("attestation algorithm does not match ES256");
    }
    if (response.temporal_attestation.key_id !== undefined && response.temporal_attestation.key_id !== header.kid) {
        throw new Error("attestation key_id does not match protected kid");
    }
    const key = jwks?.keys?.find((candidate)=>candidate.kid === header.kid);
    if (!key) throw new Error(`kid ${header.kid} is absent from JWKS`);
    if (key.kty !== "EC" || key.crv !== "P-256" || key.alg !== undefined && key.alg !== "ES256" || key.use !== undefined && key.use !== "sig") {
        throw new Error("JWKS key is not an ES256 P-256 signature key");
    }
    const signature = decodeBase64Url(encodedSignature);
    if (signature.byteLength !== 64) throw new Error("ES256 signature must be 64 bytes");
    const publicKey = await crypto.subtle.importKey("jwk", key, {
        name: "ECDSA",
        namedCurve: "P-256"
    }, false, [
        "verify"
    ]);
    const signatureVerified = await crypto.subtle.verify({
        name: "ECDSA",
        hash: "SHA-256"
    }, publicKey, signature, encoder.encode(`${encodedHeader}.${encodedPayload}`));
    if (!signatureVerified) throw new Error("ES256 temporal receipt signature is invalid");
    const signedReceipt = parseJsonPart(encodedPayload, "signed payload");
    if (canonicalJson(signedReceipt) !== canonicalJson(response.temporal_receipt)) {
        throw new Error("response temporal_receipt does not equal the signed payload");
    }
    const receipt = signedReceipt;
    const { measurementMs } = validateReceiptSemantics(receipt, options.expected_node_id ?? "767-2676.com");
    requireFinite(monotonic.paid_request_start_monotonic_ms, "paid request start");
    requireFinite(monotonic.paid_response_receive_monotonic_ms, "paid response receive");
    const decisionMonotonicMs = monotonic.decision_monotonic_ms ?? monotonic.paid_response_receive_monotonic_ms;
    requireFinite(decisionMonotonicMs, "decision time");
    if (monotonic.paid_response_receive_monotonic_ms < monotonic.paid_request_start_monotonic_ms || decisionMonotonicMs < monotonic.paid_response_receive_monotonic_ms) {
        throw new Error("monotonic observations are out of order");
    }
    const rttMs = monotonic.paid_response_receive_monotonic_ms - monotonic.paid_request_start_monotonic_ms;
    const uncertaintyMs = Math.max(0, rttMs - Math.min(receipt.server_processing_duration_ms, rttMs));
    const remainingAtReceiptMs = Math.max(0, receipt.validity_at_measurement_ms - uncertaintyMs);
    const elapsedSinceReceiptMs = decisionMonotonicMs - monotonic.paid_response_receive_monotonic_ms;
    const remainingNowMs = Math.max(0, remainingAtReceiptMs - elapsedSinceReceiptMs);
    const earliestNowMs = measurementMs + elapsedSinceReceiptMs;
    const latestNowMs = earliestNowMs + uncertaintyMs;
    const result = {
        signature_verified: true,
        key_id: header.kid,
        temporal_receipt: receipt,
        paid_request_rtt_ms: rttMs,
        network_uncertainty_ms: uncertaintyMs,
        remaining_validity_at_receipt_ms: remainingAtReceiptMs,
        remaining_validity_now_ms: remainingNowMs,
        temporal_interval_now_utc: {
            earliest: new Date(earliestNowMs).toISOString(),
            latest: new Date(latestNowMs).toISOString()
        }
    };
    if (options.execution_window_utc) {
        const opensMs = parseUtc(options.execution_window_utc.opens_at_utc, "opens_at_utc");
        const closesMs = parseUtc(options.execution_window_utc.closes_at_utc, "closes_at_utc");
        if (opensMs >= closesMs) throw new Error("execution_window_utc is not ordered");
        const eligible = remainingNowMs > 0 && earliestNowMs >= opensMs && latestNowMs < closesMs;
        result.execution_window = {
            eligible,
            next_action: eligible ? "continue_task" : "request_new_temporal_anchor",
            reason: eligible ? "verified_interval_within_execution_window" : remainingNowMs === 0 ? "temporal_evidence_expired" : "verified_interval_not_within_execution_window"
        };
    }
    return result;
}
export async function verifyPopcornWitnessEvidence(response, jwks, options) {
    return verifyPopcornWitnessEvidenceInternal(response, jwks, options, new Set());
}
async function verifyPopcornWitnessEvidenceInternal(response, jwks, options, seenAttestations, verifyPredecessor = true) {
    if (!isRecord(response) || !isRecord(response.witness_receipt)) {
        throw new Error("response is missing witness_receipt");
    }
    if (!isRecord(response.witness_attestation)) {
        throw new Error("response is missing witness_attestation");
    }
    requireExactKeys(response, [
        "witness_receipt",
        "witness_attestation",
        "payment_status"
    ], "response");
    requireExactKeys(response.witness_attestation, [
        "format",
        "algorithm",
        "key_id",
        "key_set",
        "compact_jws"
    ], "witness_attestation");
    const compact = response.witness_attestation.compact_jws;
    if (typeof compact !== "string") throw new Error("compact_jws is missing");
    if (seenAttestations.has(compact)) {
        throw new Error("witness receipt chain contains a cycle");
    }
    seenAttestations.add(compact);
    const parts = compact.split(".");
    if (parts.length !== 3 || parts.some((part)=>part.length === 0)) {
        throw new Error("compact_jws must contain exactly three parts");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJsonPart(encodedHeader, "protected header");
    if (!isRecord(header) || header.alg !== "ES256" || typeof header.kid !== "string" || header.typ !== "popcorn-witness+jws") {
        throw new Error("protected header must contain alg=ES256, kid, and typ=popcorn-witness+jws");
    }
    if (response.witness_attestation.format !== "JWS") {
        throw new Error("attestation format does not match JWS");
    }
    if (response.witness_attestation.algorithm !== "ES256") {
        throw new Error("attestation algorithm does not match ES256");
    }
    if (response.witness_attestation.key_id !== header.kid) {
        throw new Error("attestation key_id does not match protected kid");
    }
    if (response.witness_attestation.key_set !== "/.well-known/popcorn-keys.json") {
        throw new Error("attestation key_set is not canonical");
    }
    if (response.payment_status !== "settled") {
        throw new Error("witness payment_status is not settled");
    }
    const key = jwks?.keys?.find((candidate)=>candidate.kid === header.kid);
    if (!key) throw new Error(`kid ${header.kid} is absent from JWKS`);
    if (key.kty !== "EC" || key.crv !== "P-256" || key.alg !== undefined && key.alg !== "ES256" || key.use !== undefined && key.use !== "sig") {
        throw new Error("JWKS key is not an ES256 P-256 signature key");
    }
    const signature = decodeBase64Url(encodedSignature);
    if (signature.byteLength !== 64) throw new Error("ES256 signature must be 64 bytes");
    const publicKey = await crypto.subtle.importKey("jwk", key, {
        name: "ECDSA",
        namedCurve: "P-256"
    }, false, [
        "verify"
    ]);
    const signatureVerified = await crypto.subtle.verify({
        name: "ECDSA",
        hash: "SHA-256"
    }, publicKey, signature, encoder.encode(`${encodedHeader}.${encodedPayload}`));
    if (!signatureVerified) throw new Error("ES256 witness receipt signature is invalid");
    const signedReceipt = parseJsonPart(encodedPayload, "signed payload");
    if (canonicalJson(signedReceipt) !== canonicalJson(response.witness_receipt)) {
        throw new Error("response witness_receipt does not equal the signed payload");
    }
    const receipt = signedReceipt;
    requireExactKeys(receipt, [
        "receipt_id",
        "node_id",
        "protocol_id",
        "request_received_at_utc",
        "witnessed_at_utc",
        "statement_created_at_utc",
        "unix_time_milliseconds",
        "clock_accuracy_radius_ms",
        "witness_window_utc",
        "server_processing_duration_ms",
        "post_witness_processing_duration_ms",
        "commitment",
        "payment_identifier",
        "payment_transaction",
        "evidence_scope"
    ], "witness_receipt");
    if (receipt.node_id !== (options.expected_node_id ?? "767-2676.com")) {
        throw new Error("unexpected node_id");
    }
    if (receipt.protocol_id !== "POPCORN-WITNESS/1.0") {
        throw new Error("unexpected protocol_id");
    }
    if (typeof receipt.receipt_id !== "string" || receipt.receipt_id.length === 0 || typeof receipt.payment_identifier !== "string" || receipt.payment_identifier.length === 0 || !(receipt.payment_transaction === null || typeof receipt.payment_transaction === "string")) {
        throw new Error("receipt identifiers are missing");
    }
    const requestReceivedMs = parseUtc(receipt.request_received_at_utc, "request_received_at_utc");
    const witnessedMs = parseUtc(receipt.witnessed_at_utc, "witnessed_at_utc");
    const statementCreatedMs = parseUtc(receipt.statement_created_at_utc, "statement_created_at_utc");
    if (requestReceivedMs > witnessedMs || witnessedMs > statementCreatedMs) {
        throw new Error("witness receipt timestamps are out of order");
    }
    requireIntegerRelationship(statementCreatedMs - requestReceivedMs, receipt.server_processing_duration_ms, "server_processing_duration_ms");
    requireIntegerRelationship(statementCreatedMs - witnessedMs, receipt.post_witness_processing_duration_ms, "post_witness_processing_duration_ms");
    if (receipt.unix_time_milliseconds !== witnessedMs) {
        throw new Error("unix_time_milliseconds signed relationship is invalid");
    }
    if (!Number.isSafeInteger(receipt.clock_accuracy_radius_ms) || receipt.clock_accuracy_radius_ms < 0) {
        throw new Error("clock_accuracy_radius_ms must be a non-negative safe integer");
    }
    const maxRadiusMs = options.max_clock_accuracy_radius_ms ?? 60_000;
    if (!Number.isSafeInteger(maxRadiusMs) || maxRadiusMs < 0) {
        throw new Error("max_clock_accuracy_radius_ms must be a non-negative safe integer");
    }
    if (receipt.clock_accuracy_radius_ms > maxRadiusMs) {
        throw new Error("witness clock accuracy exceeds local policy");
    }
    const earliest = new Date(witnessedMs - receipt.clock_accuracy_radius_ms).toISOString();
    const latest = new Date(witnessedMs + receipt.clock_accuracy_radius_ms).toISOString();
    if (!isRecord(receipt.witness_window_utc)) {
        throw new Error("witness_window_utc is missing");
    }
    requireExactKeys(receipt.witness_window_utc, [
        "earliest",
        "latest"
    ], "witness_window_utc");
    if (receipt.witness_window_utc?.earliest !== earliest || receipt.witness_window_utc?.latest !== latest) {
        throw new Error("witness_window_utc signed relationship is invalid");
    }
    if (!isRecord(receipt.commitment)) throw new Error("commitment is missing");
    requireExactKeys(receipt.commitment, [
        "payload_digest",
        "nonce",
        "previous_attestation_digest"
    ], "commitment");
    requireSha256Digest(receipt.commitment.payload_digest, "payload_digest");
    requireNonce(receipt.commitment.nonce);
    if (receipt.commitment.previous_attestation_digest !== null) {
        requireSha256Digest(receipt.commitment.previous_attestation_digest, "previous_attestation_digest");
    }
    const scope = receipt.evidence_scope;
    const expectedScope = {
        type: "payload_commitment_witness",
        payload_disclosed: false,
        caller_identity_proven: false,
        recipient_delivery_proven: false,
        action_execution_proven: false,
        nonce_uniqueness_enforced: false,
        replay_prevented: false,
        authorization_granted: false,
        external_atomic_clock_alignment_proven: false,
        clock_accuracy_independently_verified: false,
        payer_authorization_bound_to_commitment: false
    };
    if (canonicalJson(scope) !== canonicalJson(expectedScope)) {
        throw new Error("witness evidence scope is invalid");
    }
    requireNonce(options.expected_nonce);
    if (receipt.commitment.nonce !== options.expected_nonce) {
        throw new Error("receipt nonce does not match the expected request nonce");
    }
    const hasPayload = options.expected_payload !== undefined;
    const hasDigest = options.expected_payload_digest !== undefined;
    if (hasPayload === hasDigest) {
        throw new Error("provide exactly one expected_payload or expected_payload_digest");
    }
    const expectedPayloadDigest = hasPayload ? await sha256Base64Url(options.expected_payload) : options.expected_payload_digest;
    if (!/^[A-Za-z0-9_-]{43}$/.test(expectedPayloadDigest)) {
        throw new Error("expected_payload_digest must be an unpadded base64url SHA-256 digest");
    }
    if (receipt.commitment.payload_digest.value !== expectedPayloadDigest) {
        throw new Error("receipt payload digest does not match the expected payload");
    }
    let previousAttestationDigestMatched = false;
    if (verifyPredecessor && receipt.commitment.previous_attestation_digest !== null) {
        if (options.previous_receipt === undefined) {
            throw new Error("previous receipt is required to verify the claimed chain");
        }
        try {
            await verifyPopcornWitnessEvidenceInternal(options.previous_receipt.response, options.previous_receipt.jwks, options.previous_receipt.verification, seenAttestations);
        } catch (error) {
            const message = error instanceof Error ? error.message : "verification failed";
            throw new Error(`previous receipt verification failed: ${message}`);
        }
        const expectedPreviousDigest = await digestWitnessSignedPayload(options.previous_receipt.response.witness_attestation.compact_jws);
        if (receipt.commitment.previous_attestation_digest.value !== expectedPreviousDigest) {
            throw new Error("previous signed payload digest does not match the claimed chain");
        }
        previousAttestationDigestMatched = true;
    } else if (verifyPredecessor && options.previous_receipt !== undefined) {
        throw new Error("receipt does not contain a previous attestation commitment");
    }
    return {
        signature_verified: true,
        key_id: header.kid,
        witness_receipt: receipt,
        payload_digest_verified: true,
        nonce_verified: true,
        previous_attestation_digest_matched: previousAttestationDigestMatched,
        replay_key: `${receipt.protocol_id}:${receipt.node_id}:${receipt.commitment.nonce}`,
        payment_replay_key: `x402:${receipt.payment_identifier}`,
        witness_window_utc: {
            earliest,
            latest
        }
    };
}
export async function verifyPopcornWitnessChain(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error("witness chain must contain at least one receipt");
    }
    const seenAttestations = new Set();
    const verifiedEntries = [];
    let previousSignedPayloadDigest = null;
    for (const [index, entry] of entries.entries()){
        const rawEntry = entry;
        if (!isRecord(rawEntry) || !isRecord(rawEntry.verification)) {
            throw new Error(`witness chain entry ${index} is invalid`);
        }
        if (Object.hasOwn(rawEntry.verification, "previous_receipt")) {
            throw new Error(`witness chain entry ${index} must not contain recursive previous_receipt input`);
        }
        let verified;
        try {
            verified = await verifyPopcornWitnessEvidenceInternal(entry.response, entry.jwks, entry.verification, seenAttestations, false);
        } catch (error) {
            const message = error instanceof Error ? error.message : "verification failed";
            throw new Error(`witness chain entry ${index} verification failed: ${message}`);
        }
        const claimedPreviousDigest = verified.witness_receipt.commitment.previous_attestation_digest;
        if (index === 0) {
            if (claimedPreviousDigest !== null) {
                throw new Error("witness chain entry 0 must start with previous_attestation_digest null");
            }
        } else {
            if (claimedPreviousDigest === null) {
                throw new Error(`witness chain entry ${index} is missing its predecessor digest`);
            }
            if (claimedPreviousDigest.value !== previousSignedPayloadDigest) {
                throw new Error(`witness chain entry ${index} predecessor digest does not match entry ${index - 1}`);
            }
            verified = {
                ...verified,
                previous_attestation_digest_matched: true
            };
        }
        const signedPayloadDigest = await digestWitnessSignedPayload(entry.response.witness_attestation.compact_jws);
        verifiedEntries.push({
            index,
            signed_payload_digest: signedPayloadDigest,
            verified
        });
        previousSignedPayloadDigest = signedPayloadDigest;
    }
    return {
        chain_length: verifiedEntries.length,
        head_signed_payload_digest: previousSignedPayloadDigest,
        entries: verifiedEntries
    };
}

import { createHash } from "node:crypto";
const fields = [
    "need",
    "who",
    "yes_condition",
    "boundary_utc",
    "boundary_rule",
    "expire_utc",
    "on_yes",
    "on_no"
];
export function parseTaskSchedule(bytes) {
    const text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true
    }).decode(bytes);
    const lines = text.split("\n");
    if (lines.length !== 9 || lines.pop() !== "") throw new Error("schedule requires exactly eight LF-terminated lines");
    const entries = fields.map((field, index)=>{
        const prefix = `${field}: `;
        if (!lines[index].startsWith(prefix)) throw new Error(`missing or out-of-order field: ${field}`);
        const value = lines[index].slice(prefix.length);
        if (!value || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`invalid single-line value: ${field}`);
        return [
            field,
            value
        ];
    });
    const schedule = Object.fromEntries(entries);
    for (const field of [
        "boundary_utc",
        "expire_utc"
    ]){
        const value = schedule[field];
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace("Z", ".000Z")) {
            throw new Error(`invalid UTC instant: ${field}`);
        }
    }
    if (![
        "yes_if_before",
        "yes_if_on_or_before"
    ].includes(schedule.boundary_rule) || schedule.on_yes !== "PROCEED" || ![
        "STOP",
        "REFER",
        "COUNTER"
    ].includes(schedule.on_no)) {
        throw new Error("invalid schedule rule or action");
    }
    return schedule;
}
export function evaluateTaskSchedule(schedule, L, U, condition) {
    if (condition === null) return "STOP";
    if (!condition) return schedule.on_no;
    if (!Number.isFinite(L) || !Number.isFinite(U) || L > U) return "STOP";
    const E = Date.parse(schedule.expire_utc), B = Date.parse(schedule.boundary_utc);
    if (!Number.isFinite(E) || !Number.isFinite(B)) return "STOP";
    if (L >= E) return "STOP";
    if (U >= E) return "REFETCH";
    if (schedule.boundary_rule === "yes_if_before") return U < B ? schedule.on_yes : L >= B ? schedule.on_no : "REFETCH";
    if (schedule.boundary_rule === "yes_if_on_or_before") return U <= B ? schedule.on_yes : L > B ? schedule.on_no : "REFETCH";
    return "STOP";
}
export async function verifyTaskScheduleSample(packet) {
    if (packet.format !== "TASK-SCHEDULE/1.0" || packet.historical_evidence !== true) throw new Error("not a historical task-schedule sample");
    const bytes = Buffer.from(packet.schedule_base64url, "base64url");
    if (bytes.toString("base64url") !== packet.schedule_base64url || bytes.length !== packet.byte_length || !Buffer.from(packet.schedule_utf8, "utf8").equals(bytes)) throw new Error("sample byte encodings differ");
    const schedule = parseTaskSchedule(bytes);
    const digest = createHash("sha256").update(bytes).digest("base64url");
    if (packet.payload_digest.algorithm !== "sha-256" || digest !== packet.payload_digest.value) throw new Error("sample digest mismatch");
    const options = {
        expected_payload: bytes,
        expected_nonce: packet.nonce,
        expected_node_id: "767-2676.com",
        max_clock_accuracy_radius_ms: 10000
    };
    const verified = await verifyPopcornWitnessEvidence(packet.witness_response, packet.jwks_at_verification, options);
    const tampered = Buffer.from(bytes);
    const whoOffset = bytes.indexOf(Buffer.from("who: ")) + 5;
    tampered[whoOffset] ^= 1;
    let tamperRejected = false;
    try {
        await verifyPopcornWitnessEvidence(packet.witness_response, packet.jwks_at_verification, {
            ...options,
            expected_payload: tampered
        });
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("payload digest does not match the expected payload")) throw error;
        tamperRejected = true;
    }
    if (!tamperRejected) throw new Error("who-field tampering was accepted");
    return {
        origin: "https://767-2676.com",
        format: packet.format,
        verified: true,
        digest_matches: true,
        byte_length: bytes.length,
        who: schedule.who,
        sha256: digest,
        window: verified.witness_window_utc,
        one_byte_who_tamper_rejected: true,
        historical_evidence: true,
        establishes_current_time: false,
        authorization_granted: false,
        payment_sent: false,
        network_request_made: false,
        key_trust: "Bundled historical public keys reproduce this sample; obtain trusted issuer keys independently for a real task."
    };
}

const taskSamplePacket={"format":"TASK-SCHEDULE/1.0","origin":"https://767-2676.com","byte_length":305,"schedule_utf8":"need: Verify the public schedule packet at https://767-2676.com/schedule/example\nwho: Codex\nyes_condition: The exact schedule bytes match the digest in the verified signed receipt\nboundary_utc: 2026-09-08T08:00:00Z\nboundary_rule: yes_if_before\nexpire_utc: 2026-09-09T08:00:00Z\non_yes: PROCEED\non_no: STOP\n","schedule_base64url":"bmVlZDogVmVyaWZ5IHRoZSBwdWJsaWMgc2NoZWR1bGUgcGFja2V0IGF0IGh0dHBzOi8vNzY3LTI2NzYuY29tL3NjaGVkdWxlL2V4YW1wbGUKd2hvOiBDb2RleAp5ZXNfY29uZGl0aW9uOiBUaGUgZXhhY3Qgc2NoZWR1bGUgYnl0ZXMgbWF0Y2ggdGhlIGRpZ2VzdCBpbiB0aGUgdmVyaWZpZWQgc2lnbmVkIHJlY2VpcHQKYm91bmRhcnlfdXRjOiAyMDI2LTA5LTA4VDA4OjAwOjAwWgpib3VuZGFyeV9ydWxlOiB5ZXNfaWZfYmVmb3JlCmV4cGlyZV91dGM6IDIwMjYtMDktMDlUMDg6MDA6MDBaCm9uX3llczogUFJPQ0VFRApvbl9ubzogU1RPUAo","sha256_hex":"8fcb2e7c4c7cee23dc8bb7823df1e7b4a67d33bda64e96f2cea9fc4ad8dfc97d","payload_digest":{"algorithm":"sha-256","value":"j8sufEx87iPci7eCPfHntKZ9M72mTpbyzqn8StjfyX0"},"historical_evidence":true,"not_current_time":true,"nonce":"vFX3hZ3_6Z9q9Vhv1K4jQqolaXpsIetuB_ZU6bw_noE","witness_response":{"witness_receipt":{"receipt_id":"pwr_5e456022c6a79318ac8de1881d7b4396","node_id":"767-2676.com","protocol_id":"POPCORN-WITNESS/1.0","request_received_at_utc":"2026-09-07T07:59:59.104Z","witnessed_at_utc":"2026-09-07T08:00:00.252Z","statement_created_at_utc":"2026-09-07T08:00:00.252Z","unix_time_milliseconds":1788768000252,"clock_accuracy_radius_ms":10000,"witness_window_utc":{"earliest":"2026-09-07T07:59:50.252Z","latest":"2026-09-07T08:00:10.252Z"},"server_processing_duration_ms":1148,"post_witness_processing_duration_ms":0,"commitment":{"payload_digest":{"algorithm":"sha-256","value":"j8sufEx87iPci7eCPfHntKZ9M72mTpbyzqn8StjfyX0"},"nonce":"vFX3hZ3_6Z9q9Vhv1K4jQqolaXpsIetuB_ZU6bw_noE","previous_attestation_digest":null},"payment_identifier":"eip3009_bcdec6bc5851171c7754bf0a0b29b3d73332b443c18b4e4c21e1302c23f91667","payment_transaction":"0x1efd369cffc222c2569905cd5d3cc2981765242de355df7d12728139e78eaa1c","evidence_scope":{"type":"payload_commitment_witness","payload_disclosed":false,"caller_identity_proven":false,"recipient_delivery_proven":false,"action_execution_proven":false,"nonce_uniqueness_enforced":false,"replay_prevented":false,"authorization_granted":false,"external_atomic_clock_alignment_proven":false,"clock_accuracy_independently_verified":false,"payer_authorization_bound_to_commitment":false}},"witness_attestation":{"format":"JWS","algorithm":"ES256","key_id":"popcorn-witness-2026-01","key_set":"/.well-known/popcorn-keys.json","compact_jws":"eyJhbGciOiJFUzI1NiIsImtpZCI6InBvcGNvcm4td2l0bmVzcy0yMDI2LTAxIiwidHlwIjoicG9wY29ybi13aXRuZXNzK2p3cyJ9.eyJyZWNlaXB0X2lkIjoicHdyXzVlNDU2MDIyYzZhNzkzMThhYzhkZTE4ODFkN2I0Mzk2Iiwibm9kZV9pZCI6Ijc2Ny0yNjc2LmNvbSIsInByb3RvY29sX2lkIjoiUE9QQ09STi1XSVRORVNTLzEuMCIsInJlcXVlc3RfcmVjZWl2ZWRfYXRfdXRjIjoiMjAyNi0wOS0wN1QwNzo1OTo1OS4xMDRaIiwid2l0bmVzc2VkX2F0X3V0YyI6IjIwMjYtMDktMDdUMDg6MDA6MDAuMjUyWiIsInN0YXRlbWVudF9jcmVhdGVkX2F0X3V0YyI6IjIwMjYtMDktMDdUMDg6MDA6MDAuMjUyWiIsInVuaXhfdGltZV9taWxsaXNlY29uZHMiOjE3ODg3NjgwMDAyNTIsImNsb2NrX2FjY3VyYWN5X3JhZGl1c19tcyI6MTAwMDAsIndpdG5lc3Nfd2luZG93X3V0YyI6eyJlYXJsaWVzdCI6IjIwMjYtMDktMDdUMDc6NTk6NTAuMjUyWiIsImxhdGVzdCI6IjIwMjYtMDktMDdUMDg6MDA6MTAuMjUyWiJ9LCJzZXJ2ZXJfcHJvY2Vzc2luZ19kdXJhdGlvbl9tcyI6MTE0OCwicG9zdF93aXRuZXNzX3Byb2Nlc3NpbmdfZHVyYXRpb25fbXMiOjAsImNvbW1pdG1lbnQiOnsicGF5bG9hZF9kaWdlc3QiOnsiYWxnb3JpdGhtIjoic2hhLTI1NiIsInZhbHVlIjoiajhzdWZFeDg3aVBjaTdlQ1BmSG50S1o5TTcybVRwYnl6cW44U3RqZnlYMCJ9LCJub25jZSI6InZGWDNoWjNfNlo5cTlWaHYxSzRqUXFvbGFYcHNJZXR1Ql9aVTZid19ub0UiLCJwcmV2aW91c19hdHRlc3RhdGlvbl9kaWdlc3QiOm51bGx9LCJwYXltZW50X2lkZW50aWZpZXIiOiJlaXAzMDA5X2JjZGVjNmJjNTg1MTE3MWM3NzU0YmYwYTBiMjliM2Q3MzMzMmI0NDNjMThiNGU0YzIxZTEzMDJjMjNmOTE2NjciLCJwYXltZW50X3RyYW5zYWN0aW9uIjoiMHgxZWZkMzY5Y2ZmYzIyMmMyNTY5OTA1Y2Q1ZDNjYzI5ODE3NjUyNDJkZTM1NWRmN2QxMjcyODEzOWU3OGVhYTFjIiwiZXZpZGVuY2Vfc2NvcGUiOnsidHlwZSI6InBheWxvYWRfY29tbWl0bWVudF93aXRuZXNzIiwicGF5bG9hZF9kaXNjbG9zZWQiOmZhbHNlLCJjYWxsZXJfaWRlbnRpdHlfcHJvdmVuIjpmYWxzZSwicmVjaXBpZW50X2RlbGl2ZXJ5X3Byb3ZlbiI6ZmFsc2UsImFjdGlvbl9leGVjdXRpb25fcHJvdmVuIjpmYWxzZSwibm9uY2VfdW5pcXVlbmVzc19lbmZvcmNlZCI6ZmFsc2UsInJlcGxheV9wcmV2ZW50ZWQiOmZhbHNlLCJhdXRob3JpemF0aW9uX2dyYW50ZWQiOmZhbHNlLCJleHRlcm5hbF9hdG9taWNfY2xvY2tfYWxpZ25tZW50X3Byb3ZlbiI6ZmFsc2UsImNsb2NrX2FjY3VyYWN5X2luZGVwZW5kZW50bHlfdmVyaWZpZWQiOmZhbHNlLCJwYXllcl9hdXRob3JpemF0aW9uX2JvdW5kX3RvX2NvbW1pdG1lbnQiOmZhbHNlfX0.Dyew8CCWBCGP2cEfzci6j5yBwblHP-sX_Iz79Yf7XbNNIfK0rc6URDclWVCatI1m-AOI8avkG4U3RcXarPQi8w"},"payment_status":"settled"},"jwks_at_verification":{"keys":[{"kty":"EC","crv":"P-256","x":"wCMGy1SpeYgxbzNQNgndb_-qs03LRkMNNb5nZkLsYi8","y":"OJbr-FtHN2146BYAaMZZ3LgRI7kZVDbkvjepLZFctQY","use":"sig","alg":"ES256","kid":"popcorn-time-2026-01"},{"kty":"EC","crv":"P-256","x":"bPF-sxkcKCem33P9aAiwuQZlQOaHJzUWc1FxEE6kNhs","y":"wQwlxsexe7-4J79qQmpuebyS4GmN0gqrPyN-XfpVAQA","use":"sig","alg":"ES256","kid":"popcorn-witness-2026-01","popcorn_protocol":"POPCORN-WITNESS/1.0"}]},"time_response":{"anchor_id":"pca_dfe78c020b24b9f5309068cb5fde2528","node_id":"767-2676.com","protocol_id":"POPCORN/1.0","time_zone":"America/Los_Angeles","time_zone_abbreviation":"PDT","time_pacific":"2026-09-07T01:00:45.901-07:00","time_utc":"2026-09-07T08:00:45.901Z","iso_8601":"2026-09-07T08:00:45.901Z","unix_time_seconds":1788768045,"unix_time_milliseconds":1788768045901,"valid_until_utc":"2026-09-07T08:01:45.901Z","freshness_window_ms":60000,"timing_semantics":{"clock_resolution":"millisecond","clock_source":"cloudflare_worker_runtime","external_atomic_clock_claim":false,"network_delay_included":false,"client_round_trip_measurement_required":true,"client_wall_clock_required_for_freshness":false,"client_monotonic_timer_required":true,"symmetric_network_path_assumption":false,"network_uncertainty_formula":"max(0, paid_request_rtt_ms - min(temporal_receipt.server_processing_duration_ms, paid_request_rtt_ms))","conservative_remaining_validity_formula":"max(0, temporal_receipt.validity_at_measurement_ms - network_uncertainty_ms)","uncertainty_interval_origin":"temporal_receipt.measurement_at_utc","end_to_end_latency_guarantee":null},"request_measurement":{"integrity_scope":"https_transport_advisory_not_jws_signed","used_for_uncertainty_calculation":false,"response_generated_at_utc":"2026-09-07T08:00:45.901Z","total_server_processing_duration_ms":857,"response_generation_after_measurement_ms":0,"payment_facilitator_round_trips":2},"temporal_receipt":{"anchor_id":"pca_dfe78c020b24b9f5309068cb5fde2528","node_id":"767-2676.com","protocol_id":"POPCORN/1.0","request_received_at_utc":"2026-09-07T08:00:45.044Z","observed_at_utc":"2026-09-07T08:00:45.901Z","measurement_at_utc":"2026-09-07T08:00:45.901Z","unix_time_milliseconds":1788768045901,"valid_until_utc":"2026-09-07T08:01:45.901Z","freshness_window_ms":60000,"server_processing_duration_ms":857,"post_anchor_processing_duration_ms":0,"validity_at_measurement_ms":60000,"payment_identifier":"eip3009_136e1317e0b250a7f510608dda017b2ff2e1e8b2a8b5b8eb2b4b8c4cc2d2e1f4","payment_transaction":"0xe59bd03b153d62d71fddc7d7a70f0dd3bc462cec263859df8fe24c8093021884","evidence_scope":{"type":"bearer_temporal_evidence","caller_bound":false,"task_bound":false,"authorization_granted":false}},"temporal_attestation":{"format":"JWS","algorithm":"ES256","key_id":"popcorn-time-2026-01","key_set":"/.well-known/popcorn-keys.json","compact_jws":"eyJhbGciOiJFUzI1NiIsImtpZCI6InBvcGNvcm4tdGltZS0yMDI2LTAxIiwidHlwIjoicG9wY29ybi10aW1lK2p3cyJ9.eyJhbmNob3JfaWQiOiJwY2FfZGZlNzhjMDIwYjI0YjlmNTMwOTA2OGNiNWZkZTI1MjgiLCJub2RlX2lkIjoiNzY3LTI2NzYuY29tIiwicHJvdG9jb2xfaWQiOiJQT1BDT1JOLzEuMCIsInJlcXVlc3RfcmVjZWl2ZWRfYXRfdXRjIjoiMjAyNi0wOS0wN1QwODowMDo0NS4wNDRaIiwib2JzZXJ2ZWRfYXRfdXRjIjoiMjAyNi0wOS0wN1QwODowMDo0NS45MDFaIiwibWVhc3VyZW1lbnRfYXRfdXRjIjoiMjAyNi0wOS0wN1QwODowMDo0NS45MDFaIiwidW5peF90aW1lX21pbGxpc2Vjb25kcyI6MTc4ODc2ODA0NTkwMSwidmFsaWRfdW50aWxfdXRjIjoiMjAyNi0wOS0wN1QwODowMTo0NS45MDFaIiwiZnJlc2huZXNzX3dpbmRvd19tcyI6NjAwMDAsInNlcnZlcl9wcm9jZXNzaW5nX2R1cmF0aW9uX21zIjo4NTcsInBvc3RfYW5jaG9yX3Byb2Nlc3NpbmdfZHVyYXRpb25fbXMiOjAsInZhbGlkaXR5X2F0X21lYXN1cmVtZW50X21zIjo2MDAwMCwicGF5bWVudF9pZGVudGlmaWVyIjoiZWlwMzAwOV8xMzZlMTMxN2UwYjI1MGE3ZjUxMDYwOGRkYTAxN2IyZmYyZTFlOGIyYThiNWI4ZWIyYjRiOGM0Y2MyZDJlMWY0IiwicGF5bWVudF90cmFuc2FjdGlvbiI6IjB4ZTU5YmQwM2IxNTNkNjJkNzFmZGRjN2Q3YTcwZjBkZDNiYzQ2MmNlYzI2Mzg1OWRmOGZlMjRjODA5MzAyMTg4NCIsImV2aWRlbmNlX3Njb3BlIjp7InR5cGUiOiJiZWFyZXJfdGVtcG9yYWxfZXZpZGVuY2UiLCJjYWxsZXJfYm91bmQiOmZhbHNlLCJ0YXNrX2JvdW5kIjpmYWxzZSwiYXV0aG9yaXphdGlvbl9ncmFudGVkIjpmYWxzZX19.KgmnlMzWenE1f388O6Fu0dv9Ic6XNIJZqQo7uFExTP_kL6OJ_I1I8pgDERhdlRs3EvCmV69qvKKRoY5nlsHAfg"},"payment_status":"settled","bazaar_indexing_state":"processing"},"time_observation":{"paid_request_start_monotonic_ms":0,"paid_response_receive_monotonic_ms":997.1809999999999,"decision_monotonic_ms":997.1809999999999},"time_observation_source":"Historical replay at MCP receipt: relative origin 0; client-reported measured RTT rounded outward by 0.001 ms. Not an attested execution decision.","verification":{"witness":{"signature_verified":true,"key_id":"popcorn-witness-2026-01","witness_receipt":{"receipt_id":"pwr_5e456022c6a79318ac8de1881d7b4396","node_id":"767-2676.com","protocol_id":"POPCORN-WITNESS/1.0","request_received_at_utc":"2026-09-07T07:59:59.104Z","witnessed_at_utc":"2026-09-07T08:00:00.252Z","statement_created_at_utc":"2026-09-07T08:00:00.252Z","unix_time_milliseconds":1788768000252,"clock_accuracy_radius_ms":10000,"witness_window_utc":{"earliest":"2026-09-07T07:59:50.252Z","latest":"2026-09-07T08:00:10.252Z"},"server_processing_duration_ms":1148,"post_witness_processing_duration_ms":0,"commitment":{"payload_digest":{"algorithm":"sha-256","value":"j8sufEx87iPci7eCPfHntKZ9M72mTpbyzqn8StjfyX0"},"nonce":"vFX3hZ3_6Z9q9Vhv1K4jQqolaXpsIetuB_ZU6bw_noE","previous_attestation_digest":null},"payment_identifier":"eip3009_bcdec6bc5851171c7754bf0a0b29b3d73332b443c18b4e4c21e1302c23f91667","payment_transaction":"0x1efd369cffc222c2569905cd5d3cc2981765242de355df7d12728139e78eaa1c","evidence_scope":{"type":"payload_commitment_witness","payload_disclosed":false,"caller_identity_proven":false,"recipient_delivery_proven":false,"action_execution_proven":false,"nonce_uniqueness_enforced":false,"replay_prevented":false,"authorization_granted":false,"external_atomic_clock_alignment_proven":false,"clock_accuracy_independently_verified":false,"payer_authorization_bound_to_commitment":false}},"payload_digest_verified":true,"nonce_verified":true,"previous_attestation_digest_matched":false,"replay_key":"POPCORN-WITNESS/1.0:767-2676.com:vFX3hZ3_6Z9q9Vhv1K4jQqolaXpsIetuB_ZU6bw_noE","payment_replay_key":"x402:eip3009_bcdec6bc5851171c7754bf0a0b29b3d73332b443c18b4e4c21e1302c23f91667","witness_window_utc":{"earliest":"2026-09-07T07:59:50.252Z","latest":"2026-09-07T08:00:10.252Z"}},"time":{"signature_verified":true,"key_id":"popcorn-time-2026-01","temporal_receipt":{"anchor_id":"pca_dfe78c020b24b9f5309068cb5fde2528","node_id":"767-2676.com","protocol_id":"POPCORN/1.0","request_received_at_utc":"2026-09-07T08:00:45.044Z","observed_at_utc":"2026-09-07T08:00:45.901Z","measurement_at_utc":"2026-09-07T08:00:45.901Z","unix_time_milliseconds":1788768045901,"valid_until_utc":"2026-09-07T08:01:45.901Z","freshness_window_ms":60000,"server_processing_duration_ms":857,"post_anchor_processing_duration_ms":0,"validity_at_measurement_ms":60000,"payment_identifier":"eip3009_136e1317e0b250a7f510608dda017b2ff2e1e8b2a8b5b8eb2b4b8c4cc2d2e1f4","payment_transaction":"0xe59bd03b153d62d71fddc7d7a70f0dd3bc462cec263859df8fe24c8093021884","evidence_scope":{"type":"bearer_temporal_evidence","caller_bound":false,"task_bound":false,"authorization_granted":false}},"paid_request_rtt_ms":997.1809999999999,"network_uncertainty_ms":140.18099999999993,"remaining_validity_at_receipt_ms":59859.819,"remaining_validity_now_ms":59859.819,"temporal_interval_now_utc":{"earliest":"2026-09-07T08:00:45.901Z","latest":"2026-09-07T08:00:46.041Z"}},"outward_rounded_interval_utc":{"earliest":"2026-09-07T08:00:45.901Z","latest":"2026-09-07T08:00:46.042Z"},"yes_condition":true,"historical_policy_result":"PROCEED","execution_proven":false}};
process.stdout.write(JSON.stringify(await verifyTaskScheduleSample(taskSamplePacket),null,2)+'\n');
