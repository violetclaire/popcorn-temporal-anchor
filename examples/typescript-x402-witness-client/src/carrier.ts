import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  digestWitnessSignedPayload,
  evaluateWitnessAgainstSchedule,
  verifyPopcornWitnessEvidence,
  type JsonWebKeySet,
  type PopcornWitnessResponse,
  type PortableScheduleExecutionWindowUtc,
  type WitnessVerificationOptions,
  type WitnessScheduleDecision,
} from "../../../verify/typescript/src/index.js";

export const DEFAULT_SERVICE_URL = "https://767-2676.com/v1/receipt";
export const DEFAULT_JWKS_URL =
  "https://767-2676.com/.well-known/popcorn-keys.json";

export type WitnessRequest = {
  payload_digest: { algorithm: "sha-256"; value: string };
  nonce: string;
  previous_attestation_digest: {
    algorithm: "sha-256";
    value: string;
  } | null;
};

export type PaymentExchange = {
  payment_required: string;
  payment_signature: string;
  payment_response: string;
};

export type PortableScheduleOutcome = {
  protocol_id: "POPCORN-SCHEDULE-OUTCOME/1.0";
  service_url: string;
  key_set_url: string;
  schedule: {
    encoding: "base64url";
    bytes: string;
    byte_length: number;
    payload_digest: { algorithm: "sha-256"; value: string };
  };
  submitted_request: WitnessRequest;
  previous_receipt: WitnessVerificationOptions["previous_receipt"] | null;
  paid_evidence: PopcornWitnessResponse;
  payment_exchange: PaymentExchange;
  reported_judgment: WitnessScheduleDecision;
  payload_remained_outside_popcorn: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sha256Base64Url(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("base64url");
}

export async function readExactBytes(location: string): Promise<Uint8Array> {
  if (/^https:\/\//i.test(location)) {
    const response = await fetch(location, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`request failed with HTTP ${response.status}: ${location}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(location)) {
    throw new Error("remote inputs must use HTTPS");
  }
  return new Uint8Array(await readFile(location));
}

export function decodeBase64UrlExact(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("schedule bytes are not unpadded base64url");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("schedule bytes are not canonical base64url");
  }
  return new Uint8Array(decoded);
}

export function parseScheduleWindow(
  scheduleBytes: Uint8Array,
): PortableScheduleExecutionWindowUtc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(scheduleBytes),
    );
  } catch {
    throw new Error("schedule bytes must contain valid UTF-8 JSON");
  }
  if (!isRecord(parsed) || !isRecord(parsed.execution_window_utc)) {
    throw new Error("schedule is missing execution_window_utc");
  }
  const { opens_at, closes_at } = parsed.execution_window_utc;
  if (typeof opens_at !== "string" || typeof closes_at !== "string") {
    throw new Error("schedule execution window must contain opens_at and closes_at");
  }
  return { opens_at, closes_at };
}

export async function createWitnessRequest(
  scheduleBytes: Uint8Array,
  nonce: string,
  previousResponse?: PopcornWitnessResponse,
): Promise<WitnessRequest> {
  return {
    payload_digest: {
      algorithm: "sha-256",
      value: sha256Base64Url(scheduleBytes),
    },
    nonce,
    previous_attestation_digest: previousResponse
      ? {
          algorithm: "sha-256",
          value: await digestWitnessSignedPayload(
            previousResponse.witness_attestation.compact_jws,
          ),
        }
      : null,
  };
}

export async function buildPortableOutcome(input: {
  serviceUrl: string;
  keySetUrl: string;
  scheduleBytes: Uint8Array;
  submittedRequest: WitnessRequest;
  paidEvidence: PopcornWitnessResponse;
  paymentExchange: PaymentExchange;
  jwks: JsonWebKeySet;
  previousReceipt?: WitnessVerificationOptions["previous_receipt"];
}): Promise<PortableScheduleOutcome> {
  const verified = await verifyPopcornWitnessEvidence(
    input.paidEvidence,
    input.jwks,
    {
      expected_payload: input.scheduleBytes,
      expected_nonce: input.submittedRequest.nonce,
      previous_receipt: input.previousReceipt,
      max_clock_accuracy_radius_ms: 10_000,
    },
  );
  const reportedJudgment = evaluateWitnessAgainstSchedule(
    verified.witness_window_utc,
    parseScheduleWindow(input.scheduleBytes),
  );
  return {
    protocol_id: "POPCORN-SCHEDULE-OUTCOME/1.0",
    service_url: input.serviceUrl,
    key_set_url: input.keySetUrl,
    schedule: {
      encoding: "base64url",
      bytes: Buffer.from(input.scheduleBytes).toString("base64url"),
      byte_length: input.scheduleBytes.byteLength,
      payload_digest: input.submittedRequest.payload_digest,
    },
    submitted_request: input.submittedRequest,
    previous_receipt: input.previousReceipt ?? null,
    paid_evidence: input.paidEvidence,
    payment_exchange: input.paymentExchange,
    reported_judgment: reportedJudgment,
    payload_remained_outside_popcorn: true,
  };
}

export async function verifyPortableOutcome(
  value: unknown,
  jwks: JsonWebKeySet,
  options: {
    expectedServiceUrl?: string;
    expectedKeySetUrl?: string;
    expectedNodeId?: string;
  } = {},
): Promise<{
  valid: true;
  protocol_id: "POPCORN-SCHEDULE-OUTCOME/1.0";
  service_url: string;
  payload_digest: string;
  receipt_id: string;
  signature_verified: true;
  payload_digest_verified: true;
  nonce_verified: true;
  payment_transcript_present: true;
  judgment: WitnessScheduleDecision;
}> {
  if (!isRecord(value) || value.protocol_id !== "POPCORN-SCHEDULE-OUTCOME/1.0") {
    throw new Error("outcome protocol_id is invalid");
  }
  const outcome = value as PortableScheduleOutcome;
  if (outcome.service_url !== (options.expectedServiceUrl ?? DEFAULT_SERVICE_URL)) {
    throw new Error("outcome service_url is not the trusted service");
  }
  if (outcome.key_set_url !== (options.expectedKeySetUrl ?? DEFAULT_JWKS_URL)) {
    throw new Error("outcome key_set_url is not the trusted key set");
  }
  if (
    !isRecord(outcome.schedule) ||
    outcome.schedule.encoding !== "base64url" ||
    typeof outcome.schedule.bytes !== "string" ||
    !Number.isSafeInteger(outcome.schedule.byte_length) ||
    outcome.schedule.byte_length < 1
  ) {
    throw new Error("outcome schedule encoding is invalid");
  }
  const scheduleBytes = decodeBase64UrlExact(outcome.schedule.bytes);
  if (scheduleBytes.byteLength !== outcome.schedule.byte_length) {
    throw new Error("outcome schedule byte_length does not match its bytes");
  }
  const digest = sha256Base64Url(scheduleBytes);
  if (
    outcome.schedule.payload_digest?.algorithm !== "sha-256" ||
    outcome.schedule.payload_digest.value !== digest ||
    outcome.submitted_request?.payload_digest?.algorithm !== "sha-256" ||
    outcome.submitted_request.payload_digest.value !== digest
  ) {
    throw new Error("outcome schedule digest does not match its exact bytes");
  }
  if (
    !isRecord(outcome.payment_exchange) ||
    typeof outcome.payment_exchange.payment_required !== "string" ||
    outcome.payment_exchange.payment_required.length === 0 ||
    typeof outcome.payment_exchange.payment_signature !== "string" ||
    outcome.payment_exchange.payment_signature.length === 0 ||
    typeof outcome.payment_exchange.payment_response !== "string" ||
    outcome.payment_exchange.payment_response.length === 0
  ) {
    throw new Error("outcome is missing the captured x402 payment transcript");
  }
  if (outcome.payload_remained_outside_popcorn !== true) {
    throw new Error("outcome payload boundary is invalid");
  }
  if (
    outcome.previous_receipt !== null &&
    !isRecord(outcome.previous_receipt)
  ) {
    throw new Error("outcome previous_receipt is invalid");
  }

  const verified = await verifyPopcornWitnessEvidence(
    outcome.paid_evidence,
    jwks,
    {
      expected_node_id: options.expectedNodeId ?? "767-2676.com",
      expected_payload: scheduleBytes,
      expected_nonce: outcome.submitted_request.nonce,
      previous_receipt: outcome.previous_receipt ?? undefined,
      max_clock_accuracy_radius_ms: 10_000,
    },
  );
  const judgment = evaluateWitnessAgainstSchedule(
    verified.witness_window_utc,
    parseScheduleWindow(scheduleBytes),
  );
  if (
    !isRecord(outcome.reported_judgment) ||
    outcome.reported_judgment.decision !== judgment.decision ||
    outcome.reported_judgment.authorization_granted !== false ||
    outcome.reported_judgment.reason !== judgment.reason ||
    !isRecord(outcome.reported_judgment.witness_window_utc) ||
    outcome.reported_judgment.witness_window_utc.earliest !==
      judgment.witness_window_utc.earliest ||
    outcome.reported_judgment.witness_window_utc.latest !==
      judgment.witness_window_utc.latest ||
    !isRecord(outcome.reported_judgment.execution_window_utc) ||
    outcome.reported_judgment.execution_window_utc.opens_at !==
      judgment.execution_window_utc.opens_at ||
    outcome.reported_judgment.execution_window_utc.closes_at !==
      judgment.execution_window_utc.closes_at
  ) {
    throw new Error("reported judgment does not match independent calculation");
  }
  return {
    valid: true,
    protocol_id: "POPCORN-SCHEDULE-OUTCOME/1.0",
    service_url: outcome.service_url,
    payload_digest: digest,
    receipt_id: verified.witness_receipt.receipt_id,
    signature_verified: true,
    payload_digest_verified: true,
    nonce_verified: true,
    payment_transcript_present: true,
    judgment,
  };
}
