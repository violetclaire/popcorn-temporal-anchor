export type Sha256Digest = {
  algorithm: "sha-256";
  value: string;
};

export type WitnessRequest = {
  payload_digest: Sha256Digest;
  nonce: string;
  previous_attestation_digest: Sha256Digest | null;
};

export type WitnessIssuerOptions = {
  node_id?: string;
  receipt_id: string;
  signing_key: CryptoKey;
  signing_key_id: string;
  request_received_at_ms: number;
  clock_accuracy_radius_ms: number;
  payment_identifier: string;
  payment_transaction: string | null;
  now_ms?: () => number;
};

export type PaidWitnessHttpOptions = WitnessIssuerOptions & {
  max_body_bytes?: number;
};

const encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function requireDigest(value: unknown, label: string): asserts value is Sha256Digest {
  if (
    !isRecord(value) ||
    value.algorithm !== "sha-256" ||
    typeof value.value !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.value)
  ) {
    throw new Error(`${label} must be an unpadded base64url SHA-256 digest`);
  }
}

function requireNonce(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error("nonce must be 32 unpadded base64url bytes");
  }
}

function requireExactKeys(value: Record<string, unknown>, allowed: string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error("witness request contains unsupported fields");
  }
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function requireSafeMilliseconds(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

export function parseWitnessRequest(value: unknown): WitnessRequest {
  if (!isRecord(value)) throw new Error("witness request must be a JSON object");
  requireExactKeys(value, [
    "payload_digest",
    "nonce",
    "previous_attestation_digest",
  ]);
  requireDigest(value.payload_digest, "payload_digest");
  requireNonce(value.nonce);
  if (value.previous_attestation_digest !== null) {
    requireDigest(value.previous_attestation_digest, "previous_attestation_digest");
  }
  return {
    payload_digest: value.payload_digest,
    nonce: value.nonce,
    previous_attestation_digest: value.previous_attestation_digest,
  };
}

export async function sha256Base64Url(value: string | Uint8Array): Promise<string> {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  const bytes = new Uint8Array(new ArrayBuffer(input.byteLength));
  bytes.set(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return encodeBase64Url(new Uint8Array(digest));
}

export async function issuePopcornWitnessReceipt(
  requestValue: unknown,
  options: WitnessIssuerOptions,
) {
  const request = parseWitnessRequest(requestValue);
  const nodeId = options.node_id ?? "767-2676.com";
  if (!nodeId || !options.receipt_id || !options.signing_key_id || !options.payment_identifier) {
    throw new Error("issuer and receipt identifiers are required");
  }
  requireSafeMilliseconds(options.request_received_at_ms, "request_received_at_ms");
  requireSafeMilliseconds(options.clock_accuracy_radius_ms, "clock_accuracy_radius_ms");
  const now = options.now_ms ?? Date.now;
  const witnessedAtMs = Math.round(now());
  const statementCreatedAtMs = Math.round(now());
  if (
    !Number.isSafeInteger(witnessedAtMs) ||
    !Number.isSafeInteger(statementCreatedAtMs) ||
    options.request_received_at_ms > witnessedAtMs ||
    witnessedAtMs > statementCreatedAtMs
  ) {
    throw new Error("issuer timestamps are invalid or out of order");
  }

  const witnessReceipt = {
    receipt_id: options.receipt_id,
    node_id: nodeId,
    protocol_id: "POPCORN-WITNESS/1.0",
    request_received_at_utc: iso(options.request_received_at_ms),
    witnessed_at_utc: iso(witnessedAtMs),
    statement_created_at_utc: iso(statementCreatedAtMs),
    unix_time_milliseconds: witnessedAtMs,
    clock_accuracy_radius_ms: options.clock_accuracy_radius_ms,
    witness_window_utc: {
      earliest: iso(witnessedAtMs - options.clock_accuracy_radius_ms),
      latest: iso(witnessedAtMs + options.clock_accuracy_radius_ms),
    },
    server_processing_duration_ms:
      statementCreatedAtMs - options.request_received_at_ms,
    post_witness_processing_duration_ms: statementCreatedAtMs - witnessedAtMs,
    commitment: request,
    payment_identifier: options.payment_identifier,
    payment_transaction: options.payment_transaction,
    evidence_scope: {
      type: "payload_commitment_witness",
      payload_disclosed: false,
      caller_identity_proven: false,
      recipient_delivery_proven: false,
      action_execution_proven: false,
      nonce_uniqueness_enforced: false,
      replay_prevented: false,
      authorization_granted: false,
    },
  };

  const header = {
    alg: "ES256",
    kid: options.signing_key_id,
    typ: "popcorn-witness+jws",
  };
  const encodedHeader = encodeBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = encodeBase64Url(encoder.encode(canonicalJson(witnessReceipt)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      options.signing_key,
      encoder.encode(signingInput),
    ),
  );
  if (signature.byteLength !== 64) {
    throw new Error("ES256 signer must return a 64-byte IEEE P1363 signature");
  }

  return {
    witness_receipt: witnessReceipt,
    witness_attestation: {
      format: "JWS",
      algorithm: "ES256",
      key_id: options.signing_key_id,
      compact_jws: `${signingInput}.${encodeBase64Url(signature)}`,
    },
  };
}

export async function handlePaidWitnessRequest(
  request: Request,
  options: PaidWitnessHttpOptions,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    return Response.json({ error: "unsupported_content_type" }, { status: 415 });
  }
  const maxBodyBytes = options.max_body_bytes ?? 4096;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 256) {
    throw new Error("max_body_bytes must be a safe integer of at least 256");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }

  const body = await request.text();
  if (encoder.encode(body).byteLength > maxBodyBytes) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  let requestValue: unknown;
  try {
    requestValue = JSON.parse(body);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const response = await issuePopcornWitnessReceipt(requestValue, options);
    return Response.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "X-POPCORN-Protocol": "POPCORN-WITNESS/1.0",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "invalid_witness_request",
        message: error instanceof Error ? error.message : "invalid request",
      },
      { status: 422 },
    );
  }
}
