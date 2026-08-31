export type PopcornJsonWebKey = JsonWebKey & { kid?: string };
export type JsonWebKeySet = { keys: PopcornJsonWebKey[] };

export type TemporalReceipt = {
  anchor_id: string;
  node_id: string;
  protocol_id: string;
  request_received_at_utc: string;
  observed_at_utc: string;
  measurement_at_utc: string;
  unix_time_milliseconds: number;
  valid_until_utc: string;
  freshness_window_ms: number;
  server_processing_duration_ms: number;
  post_anchor_processing_duration_ms: number;
  validity_at_measurement_ms: number;
  payment_identifier: string;
  payment_transaction: string | null;
  evidence_scope: {
    type: string;
    caller_bound: boolean;
    task_bound: boolean;
    authorization_granted: boolean;
  };
};

export type PopcornResponse = {
  temporal_receipt: TemporalReceipt;
  temporal_attestation: {
    format?: string;
    algorithm?: string;
    key_id?: string;
    compact_jws: string;
  };
};

export type MonotonicObservation = {
  paid_request_start_monotonic_ms: number;
  paid_response_receive_monotonic_ms: number;
  decision_monotonic_ms?: number;
};

export type ExecutionWindowUtc = {
  opens_at_utc: string;
  closes_at_utc: string;
};

export type VerifiedTemporalEvidence = {
  signature_verified: true;
  key_id: string;
  temporal_receipt: TemporalReceipt;
  paid_request_rtt_ms: number;
  network_uncertainty_ms: number;
  remaining_validity_at_receipt_ms: number;
  remaining_validity_now_ms: number;
  temporal_interval_now_utc: {
    earliest: string;
    latest: string;
  };
  execution_window?: {
    eligible: boolean;
    next_action: "continue_task" | "request_new_temporal_anchor";
    reason:
      | "verified_interval_within_execution_window"
      | "temporal_evidence_expired"
      | "verified_interval_not_within_execution_window";
  };
};

export type Sha256Digest = {
  algorithm: "sha-256";
  value: string;
};

export type WitnessCommitment = {
  payload_digest: Sha256Digest;
  nonce: string;
  previous_attestation_digest: Sha256Digest | null;
};

export type WitnessReceipt = {
  receipt_id: string;
  node_id: string;
  protocol_id: string;
  request_received_at_utc: string;
  witnessed_at_utc: string;
  statement_created_at_utc: string;
  unix_time_milliseconds: number;
  clock_accuracy_radius_ms: number;
  witness_window_utc: {
    earliest: string;
    latest: string;
  };
  server_processing_duration_ms: number;
  post_witness_processing_duration_ms: number;
  commitment: WitnessCommitment;
  payment_identifier: string;
  payment_transaction: string | null;
  evidence_scope: {
    type: string;
    payload_disclosed: boolean;
    caller_identity_proven: boolean;
    recipient_delivery_proven: boolean;
    action_execution_proven: boolean;
    nonce_uniqueness_enforced: boolean;
    replay_prevented: boolean;
    authorization_granted: boolean;
    external_atomic_clock_alignment_proven: boolean;
    clock_accuracy_independently_verified: boolean;
    payer_authorization_bound_to_commitment: boolean;
  };
};

export type PopcornWitnessResponse = {
  witness_receipt: WitnessReceipt;
  witness_attestation: {
    format?: string;
    algorithm?: string;
    key_id?: string;
    key_set?: string;
    compact_jws: string;
  };
  payment_status: "settled";
};

export type WitnessVerificationOptions = {
  expected_node_id?: string;
  expected_nonce: string;
  expected_payload?: string | Uint8Array;
  expected_payload_digest?: string;
  expected_previous_attestation?: string;
  max_clock_accuracy_radius_ms?: number;
};

export type VerifiedWitnessEvidence = {
  signature_verified: true;
  key_id: string;
  witness_receipt: WitnessReceipt;
  payload_digest_verified: true;
  nonce_verified: true;
  previous_attestation_digest_matched: boolean;
  replay_key: string;
  payment_replay_key: string;
  witness_window_utc: {
    earliest: string;
    latest: string;
  };
};

const encoder = new TextEncoder();

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("compact JWS contains invalid base64url");
  }
  const decoded = Buffer.from(value, "base64url");
  const copy = new Uint8Array(new ArrayBuffer(decoded.length));
  copy.set(decoded);
  return copy;
}

function parseJsonPart(value: string, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid base64url JSON`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: string[],
  label: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} contains missing or unsupported fields`);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function encodeBase64Url(value: ArrayBuffer): string {
  return Buffer.from(value).toString("base64url");
}

async function sha256Base64Url(value: string | Uint8Array): Promise<string> {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  const bytes = new Uint8Array(new ArrayBuffer(input.byteLength));
  bytes.set(input);
  return encodeBase64Url(await crypto.subtle.digest("SHA-256", bytes));
}

function requireSha256Digest(value: unknown, label: string): asserts value is Sha256Digest {
  if (
    !isRecord(value) ||
    value.algorithm !== "sha-256" ||
    typeof value.value !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.value)
  ) {
    throw new Error(`${label} must be an unpadded base64url SHA-256 digest`);
  }
  requireExactKeys(value, ["algorithm", "value"], label);
}

function requireNonce(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error("nonce must be 32 unpadded base64url bytes");
  }
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function parseUtc(value: string, label: string): number {
  if (typeof value !== "string" || !value.endsWith("Z")) {
    throw new Error(`${label} must be an explicit UTC timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function requireIntegerRelationship(
  actual: number,
  expected: number,
  label: string,
): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || actual !== expected) {
    throw new Error(`${label} signed relationship is invalid`);
  }
}

function validateReceiptSemantics(
  receipt: TemporalReceipt,
  expectedNodeId: string,
): { measurementMs: number; validUntilMs: number } {
  if (receipt.node_id !== expectedNodeId) throw new Error("unexpected node_id");
  if (receipt.protocol_id !== "POPCORN/1.0") throw new Error("unexpected protocol_id");
  if (!receipt.anchor_id || !receipt.payment_identifier) {
    throw new Error("receipt identifiers are missing");
  }

  const requestReceivedMs = parseUtc(
    receipt.request_received_at_utc,
    "request_received_at_utc",
  );
  const observedMs = parseUtc(receipt.observed_at_utc, "observed_at_utc");
  const measurementMs = parseUtc(
    receipt.measurement_at_utc,
    "measurement_at_utc",
  );
  const validUntilMs = parseUtc(receipt.valid_until_utc, "valid_until_utc");

  requireIntegerRelationship(
    measurementMs - requestReceivedMs,
    receipt.server_processing_duration_ms,
    "server_processing_duration_ms",
  );
  requireIntegerRelationship(
    measurementMs - observedMs,
    receipt.post_anchor_processing_duration_ms,
    "post_anchor_processing_duration_ms",
  );
  requireIntegerRelationship(
    validUntilMs - measurementMs,
    receipt.validity_at_measurement_ms,
    "validity_at_measurement_ms",
  );
  requireIntegerRelationship(
    validUntilMs - observedMs,
    receipt.freshness_window_ms,
    "freshness_window_ms",
  );
  if (receipt.unix_time_milliseconds !== observedMs) {
    throw new Error("unix_time_milliseconds signed relationship is invalid");
  }
  if (
    receipt.evidence_scope?.type !== "bearer_temporal_evidence" ||
    receipt.evidence_scope.caller_bound !== false ||
    receipt.evidence_scope.task_bound !== false ||
    receipt.evidence_scope.authorization_granted !== false
  ) {
    throw new Error("temporal evidence must be bearer, non-authorizing, and unbound");
  }
  return { measurementMs, validUntilMs };
}

export async function verifyPopcornTemporalEvidence(
  response: PopcornResponse,
  jwks: JsonWebKeySet,
  monotonic: MonotonicObservation,
  options: { expected_node_id?: string; execution_window_utc?: ExecutionWindowUtc } = {},
): Promise<VerifiedTemporalEvidence> {
  if (!isRecord(response) || !isRecord(response.temporal_receipt)) {
    throw new Error("response is missing temporal_receipt");
  }
  if (!isRecord(response.temporal_attestation)) {
    throw new Error("response is missing temporal_attestation");
  }

  const compact = response.temporal_attestation.compact_jws;
  if (typeof compact !== "string") throw new Error("compact_jws is missing");
  const parts = compact.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error("compact_jws must contain exactly three parts");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonPart(encodedHeader, "protected header");
  if (!isRecord(header) || header.alg !== "ES256" || typeof header.kid !== "string") {
    throw new Error("protected header must contain alg=ES256 and kid");
  }
  if (
    response.temporal_attestation.algorithm !== undefined &&
    response.temporal_attestation.algorithm !== "ES256"
  ) {
    throw new Error("attestation algorithm does not match ES256");
  }
  if (
    response.temporal_attestation.key_id !== undefined &&
    response.temporal_attestation.key_id !== header.kid
  ) {
    throw new Error("attestation key_id does not match protected kid");
  }

  const key = jwks?.keys?.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error(`kid ${header.kid} is absent from JWKS`);
  if (
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    (key.alg !== undefined && key.alg !== "ES256") ||
    (key.use !== undefined && key.use !== "sig")
  ) {
    throw new Error("JWKS key is not an ES256 P-256 signature key");
  }

  const signature = decodeBase64Url(encodedSignature);
  if (signature.byteLength !== 64) throw new Error("ES256 signature must be 64 bytes");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signatureVerified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!signatureVerified) throw new Error("ES256 temporal receipt signature is invalid");

  const signedReceipt = parseJsonPart(encodedPayload, "signed payload");
  if (canonicalJson(signedReceipt) !== canonicalJson(response.temporal_receipt)) {
    throw new Error("response temporal_receipt does not equal the signed payload");
  }
  const receipt = signedReceipt as TemporalReceipt;
  const { measurementMs } = validateReceiptSemantics(
    receipt,
    options.expected_node_id ?? "767-2676.com",
  );

  requireFinite(monotonic.paid_request_start_monotonic_ms, "paid request start");
  requireFinite(monotonic.paid_response_receive_monotonic_ms, "paid response receive");
  const decisionMonotonicMs =
    monotonic.decision_monotonic_ms ?? monotonic.paid_response_receive_monotonic_ms;
  requireFinite(decisionMonotonicMs, "decision time");
  if (
    monotonic.paid_response_receive_monotonic_ms <
      monotonic.paid_request_start_monotonic_ms ||
    decisionMonotonicMs < monotonic.paid_response_receive_monotonic_ms
  ) {
    throw new Error("monotonic observations are out of order");
  }

  const rttMs =
    monotonic.paid_response_receive_monotonic_ms -
    monotonic.paid_request_start_monotonic_ms;
  const uncertaintyMs = Math.max(
    0,
    rttMs - Math.min(receipt.server_processing_duration_ms, rttMs),
  );
  const remainingAtReceiptMs = Math.max(
    0,
    receipt.validity_at_measurement_ms - uncertaintyMs,
  );
  const elapsedSinceReceiptMs =
    decisionMonotonicMs - monotonic.paid_response_receive_monotonic_ms;
  const remainingNowMs = Math.max(0, remainingAtReceiptMs - elapsedSinceReceiptMs);
  const earliestNowMs = measurementMs + elapsedSinceReceiptMs;
  const latestNowMs = earliestNowMs + uncertaintyMs;

  const result: VerifiedTemporalEvidence = {
    signature_verified: true,
    key_id: header.kid,
    temporal_receipt: receipt,
    paid_request_rtt_ms: rttMs,
    network_uncertainty_ms: uncertaintyMs,
    remaining_validity_at_receipt_ms: remainingAtReceiptMs,
    remaining_validity_now_ms: remainingNowMs,
    temporal_interval_now_utc: {
      earliest: new Date(earliestNowMs).toISOString(),
      latest: new Date(latestNowMs).toISOString(),
    },
  };

  if (options.execution_window_utc) {
    const opensMs = parseUtc(options.execution_window_utc.opens_at_utc, "opens_at_utc");
    const closesMs = parseUtc(options.execution_window_utc.closes_at_utc, "closes_at_utc");
    if (opensMs >= closesMs) throw new Error("execution_window_utc is not ordered");
    const eligible =
      remainingNowMs > 0 && earliestNowMs >= opensMs && latestNowMs < closesMs;
    result.execution_window = {
      eligible,
      next_action: eligible ? "continue_task" : "request_new_temporal_anchor",
      reason: eligible
        ? "verified_interval_within_execution_window"
        : remainingNowMs === 0
          ? "temporal_evidence_expired"
          : "verified_interval_not_within_execution_window",
    };
  }
  return result;
}

export async function verifyPopcornWitnessEvidence(
  response: PopcornWitnessResponse,
  jwks: JsonWebKeySet,
  options: WitnessVerificationOptions,
): Promise<VerifiedWitnessEvidence> {
  if (!isRecord(response) || !isRecord(response.witness_receipt)) {
    throw new Error("response is missing witness_receipt");
  }
  if (!isRecord(response.witness_attestation)) {
    throw new Error("response is missing witness_attestation");
  }
  requireExactKeys(
    response,
    ["witness_receipt", "witness_attestation", "payment_status"],
    "response",
  );
  requireExactKeys(
    response.witness_attestation,
    ["format", "algorithm", "key_id", "key_set", "compact_jws"],
    "witness_attestation",
  );

  const compact = response.witness_attestation.compact_jws;
  if (typeof compact !== "string") throw new Error("compact_jws is missing");
  const parts = compact.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error("compact_jws must contain exactly three parts");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonPart(encodedHeader, "protected header");
  if (
    !isRecord(header) ||
    header.alg !== "ES256" ||
    typeof header.kid !== "string" ||
    header.typ !== "popcorn-witness+jws"
  ) {
    throw new Error(
      "protected header must contain alg=ES256, kid, and typ=popcorn-witness+jws",
    );
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

  const key = jwks?.keys?.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error(`kid ${header.kid} is absent from JWKS`);
  if (
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    (key.alg !== undefined && key.alg !== "ES256") ||
    (key.use !== undefined && key.use !== "sig")
  ) {
    throw new Error("JWKS key is not an ES256 P-256 signature key");
  }

  const signature = decodeBase64Url(encodedSignature);
  if (signature.byteLength !== 64) throw new Error("ES256 signature must be 64 bytes");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signatureVerified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!signatureVerified) throw new Error("ES256 witness receipt signature is invalid");

  const signedReceipt = parseJsonPart(encodedPayload, "signed payload");
  if (canonicalJson(signedReceipt) !== canonicalJson(response.witness_receipt)) {
    throw new Error("response witness_receipt does not equal the signed payload");
  }
  const receipt = signedReceipt as WitnessReceipt;
  requireExactKeys(
    receipt as unknown as Record<string, unknown>,
    [
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
      "evidence_scope",
    ],
    "witness_receipt",
  );
  if (receipt.node_id !== (options.expected_node_id ?? "767-2676.com")) {
    throw new Error("unexpected node_id");
  }
  if (receipt.protocol_id !== "POPCORN-WITNESS/1.0") {
    throw new Error("unexpected protocol_id");
  }
  if (
    typeof receipt.receipt_id !== "string" ||
    receipt.receipt_id.length === 0 ||
    typeof receipt.payment_identifier !== "string" ||
    receipt.payment_identifier.length === 0 ||
    !(
      receipt.payment_transaction === null ||
      typeof receipt.payment_transaction === "string"
    )
  ) {
    throw new Error("receipt identifiers are missing");
  }

  const requestReceivedMs = parseUtc(
    receipt.request_received_at_utc,
    "request_received_at_utc",
  );
  const witnessedMs = parseUtc(receipt.witnessed_at_utc, "witnessed_at_utc");
  const statementCreatedMs = parseUtc(
    receipt.statement_created_at_utc,
    "statement_created_at_utc",
  );
  if (requestReceivedMs > witnessedMs || witnessedMs > statementCreatedMs) {
    throw new Error("witness receipt timestamps are out of order");
  }
  requireIntegerRelationship(
    statementCreatedMs - requestReceivedMs,
    receipt.server_processing_duration_ms,
    "server_processing_duration_ms",
  );
  requireIntegerRelationship(
    statementCreatedMs - witnessedMs,
    receipt.post_witness_processing_duration_ms,
    "post_witness_processing_duration_ms",
  );
  if (receipt.unix_time_milliseconds !== witnessedMs) {
    throw new Error("unix_time_milliseconds signed relationship is invalid");
  }
  if (
    !Number.isSafeInteger(receipt.clock_accuracy_radius_ms) ||
    receipt.clock_accuracy_radius_ms < 0
  ) {
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
  requireExactKeys(
    receipt.witness_window_utc,
    ["earliest", "latest"],
    "witness_window_utc",
  );
  if (
    receipt.witness_window_utc?.earliest !== earliest ||
    receipt.witness_window_utc?.latest !== latest
  ) {
    throw new Error("witness_window_utc signed relationship is invalid");
  }

  if (!isRecord(receipt.commitment)) throw new Error("commitment is missing");
  requireExactKeys(
    receipt.commitment,
    ["payload_digest", "nonce", "previous_attestation_digest"],
    "commitment",
  );
  requireSha256Digest(receipt.commitment.payload_digest, "payload_digest");
  requireNonce(receipt.commitment.nonce);
  if (receipt.commitment.previous_attestation_digest !== null) {
    requireSha256Digest(
      receipt.commitment.previous_attestation_digest,
      "previous_attestation_digest",
    );
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
    payer_authorization_bound_to_commitment: false,
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
  const expectedPayloadDigest = hasPayload
    ? await sha256Base64Url(options.expected_payload as string | Uint8Array)
    : (options.expected_payload_digest as string);
  if (!/^[A-Za-z0-9_-]{43}$/.test(expectedPayloadDigest)) {
    throw new Error("expected_payload_digest must be an unpadded base64url SHA-256 digest");
  }
  if (receipt.commitment.payload_digest.value !== expectedPayloadDigest) {
    throw new Error("receipt payload digest does not match the expected payload");
  }

  let previousAttestationDigestMatched = false;
  if (receipt.commitment.previous_attestation_digest !== null) {
    if (options.expected_previous_attestation === undefined) {
      throw new Error("previous attestation is required to verify the claimed chain");
    }
    const expectedPreviousDigest = await sha256Base64Url(
      options.expected_previous_attestation,
    );
    if (
      receipt.commitment.previous_attestation_digest.value !== expectedPreviousDigest
    ) {
      throw new Error("previous attestation digest does not match the claimed chain");
    }
    previousAttestationDigestMatched = true;
  } else if (options.expected_previous_attestation !== undefined) {
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
    witness_window_utc: { earliest, latest },
  };
}
