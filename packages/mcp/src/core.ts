import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { ExactEvmScheme } from "@x402/evm/exact/client";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

import {
  verifyPopcornTemporalEvidence,
  verifyPopcornWitnessChain,
  verifyPopcornWitnessEvidence,
  type JsonWebKeySet,
  type PopcornResponse,
  type PopcornWitnessResponse,
  type VerifiedWitnessChain,
  type WitnessChainEntry,
  type WitnessVerificationOptions,
} from "../../../verify/typescript/src/index.js";

export type {
  VerifiedWitnessChain,
  WitnessChainEntry,
  WitnessChainVerificationOptions,
} from "../../../verify/typescript/src/index.js";

export const POPCORN_ORIGIN = "https://767-2676.com";
export const POPCORN_TIME_URL = `${POPCORN_ORIGIN}/v1/time`;
export const POPCORN_WITNESS_URL = `${POPCORN_ORIGIN}/v1/receipt`;
export const POPCORN_JWKS_URL = `${POPCORN_ORIGIN}/.well-known/popcorn-keys.json`;
export const POPCORN_PRICE_ATOMIC = "1000";
export const POPCORN_NETWORK = "eip155:8453";
export const POPCORN_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const POPCORN_PAY_TO = "0x5f5a631e975183d084f60d7121e967b30ec83cb8";

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

export type PaymentDryRun = {
  payment_sent: false;
  request: {
    method: "GET" | "POST";
    url: string;
    headers: Record<string, string>;
    body_utf8: string | null;
  };
  challenge: {
    status: 402;
    payment_required: string;
    decoded_terms: JsonRecord;
    response_body: unknown;
  };
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeCanonicalBase64Url(value: string, label: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} must be canonical unpadded base64url`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error(`${label} must be canonical unpadded base64url`);
  }
  return decoded;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function decodePaymentRequired(value: string): JsonRecord {
  const parsed = parseJson(
    decodeCanonicalBase64Url(value, "PAYMENT-REQUIRED").toString("utf8"),
    "PAYMENT-REQUIRED",
  );
  if (!isRecord(parsed)) throw new Error("PAYMENT-REQUIRED must decode to an object");
  return parsed;
}

function validatePaymentTerms(
  header: string,
  expectedUrl: string,
): JsonRecord {
  const terms = decodePaymentRequired(header);
  if (terms.x402Version !== 2 || !isRecord(terms.resource)) {
    throw new Error("POPCORN returned unsupported x402 terms");
  }
  if (terms.resource.url !== expectedUrl) {
    throw new Error("x402 challenge resource URL changed");
  }
  if (!Array.isArray(terms.accepts) || terms.accepts.length !== 1) {
    throw new Error("x402 challenge must contain exactly one payment option");
  }
  const option = terms.accepts[0];
  if (
    !isRecord(option) ||
    option.scheme !== "exact" ||
    option.network !== POPCORN_NETWORK ||
    option.amount !== POPCORN_PRICE_ATOMIC ||
    typeof option.asset !== "string" ||
    option.asset.toLowerCase() !== POPCORN_USDC.toLowerCase() ||
    typeof option.payTo !== "string" ||
    option.payTo.toLowerCase() !== POPCORN_PAY_TO.toLowerCase()
  ) {
    throw new Error("x402 challenge differs from the locked POPCORN payment policy");
  }
  return terms;
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function challengeRequest(
  request: PaymentDryRun["request"],
  fetchImpl: FetchLike,
): Promise<PaymentDryRun> {
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body_utf8 === null ? {} : { body: request.body_utf8 }),
  });
  const body = await responseBody(response);
  if (response.status !== 402) {
    throw new Error(`expected HTTP 402, received HTTP ${response.status}`);
  }
  const paymentRequired = response.headers.get("payment-required");
  if (!paymentRequired) throw new Error("HTTP 402 is missing PAYMENT-REQUIRED");
  const terms = validatePaymentTerms(paymentRequired, request.url);
  return {
    payment_sent: false,
    request,
    challenge: {
      status: 402,
      payment_required: paymentRequired,
      decoded_terms: terms,
      response_body: body,
    },
  };
}

function requirePrivateKey(environment: NodeJS.ProcessEnv): `0x${string}` {
  const value = environment.EVM_PRIVATE_KEY;
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "approve_payment was true, but EVM_PRIVATE_KEY is not a 32-byte hex Base payer key",
    );
  }
  return value as `0x${string}`;
}

async function paidRequest(
  request: PaymentDryRun["request"],
  fetchImpl: FetchLike,
  environment: NodeJS.ProcessEnv,
): Promise<{
  response: Response;
  paid_response: unknown;
  payment_response: string;
  payment_response_decoded: unknown;
}> {
  const privateKey = requirePrivateKey(environment);
  const signer = privateKeyToAccount(privateKey);
  const client = new x402Client()
    .register(POPCORN_NETWORK, new ExactEvmScheme(signer))
    .setSpendControls({ maxAmountPerPayment: "$0.001" });

  const guardedFetch: FetchLike = async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status === 402) {
      const header = response.headers.get("payment-required");
      if (!header) throw new Error("HTTP 402 is missing PAYMENT-REQUIRED");
      validatePaymentTerms(header, request.url);
    }
    return response;
  };
  const fetchWithPayment = wrapFetchWithPayment(guardedFetch, client);
  const response = await fetchWithPayment(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body_utf8 === null ? {} : { body: request.body_utf8 }),
  });
  const paymentResponse = response.headers.get("payment-response");
  const body = await responseBody(response);
  if (!response.ok) {
    throw new Error(`paid POPCORN request failed with HTTP ${response.status}`);
  }
  if (!paymentResponse) {
    throw new Error("paid POPCORN response is missing PAYMENT-RESPONSE");
  }
  let decoded: unknown;
  try {
    decoded = parseJson(
      decodeCanonicalBase64Url(paymentResponse, "PAYMENT-RESPONSE").toString("utf8"),
      "PAYMENT-RESPONSE",
    );
  } catch {
    decoded = null;
  }
  return {
    response,
    paid_response: body,
    payment_response: paymentResponse,
    payment_response_decoded: decoded,
  };
}

async function fetchJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return responseBody(response);
}

export async function popcornCatalog(fetchImpl: FetchLike = fetch) {
  const resources = {
    live_offer: `${POPCORN_ORIGIN}/agent/offer`,
    repository_service_catalog:
      "https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/service-catalog.json",
    published_keys: POPCORN_JWKS_URL,
    execution_schedule_schema: `${POPCORN_ORIGIN}/schemas/execution-schedule.v1.json`,
    witness_request_schema: `${POPCORN_ORIGIN}/schemas/witness-request.v1.json`,
    witness_response_schema: `${POPCORN_ORIGIN}/schemas/witness-response.v1.json`,
  };
  const entries = await Promise.all(
    Object.entries(resources).map(async ([name, url]) => [name, await fetchJson(url, fetchImpl)]),
  );
  return {
    payment_sent: false,
    canonical_origin: POPCORN_ORIGIN,
    resources: Object.fromEntries(entries),
  };
}

export function popcornHash(input: {
  payload_text?: string;
  payload_base64url?: string;
}) {
  const hasText = input.payload_text !== undefined;
  const hasBase64 = input.payload_base64url !== undefined;
  if (hasText === hasBase64) {
    throw new Error("provide exactly one payload_text or payload_base64url");
  }
  const bytes = hasText
    ? Buffer.from(input.payload_text as string, "utf8")
    : decodeCanonicalBase64Url(
        input.payload_base64url as string,
        "payload_base64url",
      );
  return {
    payment_sent: false,
    input_encoding: hasText ? "utf8" : "base64url",
    byte_length: bytes.byteLength,
    digest: {
      algorithm: "sha-256" as const,
      value: createHash("sha256").update(bytes).digest("base64url"),
    },
  };
}

function witnessOptions(value: unknown): WitnessVerificationOptions {
  if (!isRecord(value) || typeof value.expected_nonce !== "string") {
    throw new Error("witness verification requires expected_nonce");
  }
  const forms = [
    value.expected_payload_text !== undefined,
    value.expected_payload_base64url !== undefined,
    value.expected_payload_digest !== undefined,
  ].filter(Boolean).length;
  if (forms !== 1) {
    throw new Error(
      "provide exactly one expected_payload_text, expected_payload_base64url, or expected_payload_digest",
    );
  }
  const options: WitnessVerificationOptions = {
    expected_nonce: value.expected_nonce,
    ...(typeof value.expected_node_id === "string"
      ? { expected_node_id: value.expected_node_id }
      : {}),
    ...(typeof value.max_clock_accuracy_radius_ms === "number"
      ? { max_clock_accuracy_radius_ms: value.max_clock_accuracy_radius_ms }
      : {}),
  };
  if (typeof value.expected_payload_text === "string") {
    options.expected_payload = value.expected_payload_text;
  } else if (typeof value.expected_payload_base64url === "string") {
    options.expected_payload = decodeCanonicalBase64Url(
      value.expected_payload_base64url,
      "expected_payload_base64url",
    );
  } else if (typeof value.expected_payload_digest === "string") {
    options.expected_payload_digest = value.expected_payload_digest;
  } else {
    throw new Error("expected witness payload form is invalid");
  }
  if (value.previous_receipt !== undefined) {
    if (!isRecord(value.previous_receipt)) {
      throw new Error("previous_receipt must be an object");
    }
    const previous = value.previous_receipt;
    if (!isRecord(previous.response) || !isRecord(previous.jwks)) {
      throw new Error("previous_receipt requires response and jwks objects");
    }
    options.previous_receipt = {
      response: previous.response as PopcornWitnessResponse,
      jwks: previous.jwks as JsonWebKeySet,
      verification: witnessOptions(previous.verification),
    };
  }
  return options;
}

export async function popcornVerify(input: {
  receipt_type: "time" | "witness";
  response: JsonRecord;
  jwks: JsonRecord;
  verification: JsonRecord;
}) {
  if (input.receipt_type === "witness") {
    const verified = await verifyPopcornWitnessEvidence(
      input.response as PopcornWitnessResponse,
      input.jwks as JsonWebKeySet,
      witnessOptions(input.verification),
    );
    return { receipt_type: "witness" as const, verified };
  }
  const observation = input.verification.observation;
  if (!isRecord(observation)) {
    throw new Error("time verification requires an observation object");
  }
  const policy = input.verification.policy;
  const verified = await verifyPopcornTemporalEvidence(
    input.response as PopcornResponse,
    input.jwks as JsonWebKeySet,
    observation as {
      paid_request_start_monotonic_ms: number;
      paid_response_receive_monotonic_ms: number;
      decision_monotonic_ms?: number;
    },
    isRecord(policy) ? policy : {},
  );
  return { receipt_type: "time" as const, verified };
}

export async function popcornVerifyWitnessChain(
  entries: readonly WitnessChainEntry[],
): Promise<VerifiedWitnessChain> {
  return verifyPopcornWitnessChain(entries);
}

function timeRequest(freshnessMs: number): PaymentDryRun["request"] {
  if (!Number.isSafeInteger(freshnessMs) || freshnessMs < 100 || freshnessMs > 60_000) {
    throw new Error("freshness_ms must be an integer from 100 through 60000");
  }
  return {
    method: "GET",
    url: `${POPCORN_TIME_URL}?freshness_ms=${freshnessMs}`,
    headers: { Accept: "application/json" },
    body_utf8: null,
  };
}

export async function popcornTime(
  input: { freshness_ms?: number; approve_payment?: boolean },
  dependencies: { fetch?: FetchLike; env?: NodeJS.ProcessEnv } = {},
) {
  const fetchImpl = dependencies.fetch ?? fetch;
  const request = timeRequest(input.freshness_ms ?? 30_000);
  const dryRun = await challengeRequest(request, fetchImpl);
  if (input.approve_payment !== true) return dryRun;

  const started = performance.now();
  const paid = await paidRequest(request, fetchImpl, dependencies.env ?? process.env);
  const received = performance.now();
  if (!isRecord(paid.paid_response) || !isRecord(paid.paid_response.temporal_receipt)) {
    throw new Error("paid time response is missing temporal_receipt");
  }
  const receipt = paid.paid_response.temporal_receipt;
  if (
    typeof receipt.payment_transaction !== "string" ||
    receipt.payment_transaction.length === 0 ||
    !Number.isSafeInteger(receipt.server_processing_duration_ms)
  ) {
    throw new Error("paid time response is missing settlement or timing data");
  }
  return {
    payment_sent: true,
    request,
    settlement_tx_hash: receipt.payment_transaction,
    server_processing_duration_ms: receipt.server_processing_duration_ms,
    paid_request_elapsed_ms: Math.round((received - started) * 1000) / 1000,
    payment_response: paid.payment_response,
    payment_response_decoded: paid.payment_response_decoded,
    response: paid.paid_response,
  };
}

function requireDigest(value: string, label: string): void {
  const decoded = decodeCanonicalBase64Url(value, label);
  if (decoded.byteLength !== 32) throw new Error(`${label} must decode to 32 bytes`);
}

function witnessRequest(input: {
  digest: string;
  nonce: string;
  previous_attestation_digest?: string | null;
}): PaymentDryRun["request"] {
  requireDigest(input.digest, "digest");
  requireDigest(input.nonce, "nonce");
  if (typeof input.previous_attestation_digest === "string") {
    requireDigest(input.previous_attestation_digest, "previous_attestation_digest");
  }
  const body = {
    payload_digest: { algorithm: "sha-256", value: input.digest },
    nonce: input.nonce,
    previous_attestation_digest:
      input.previous_attestation_digest === undefined ||
      input.previous_attestation_digest === null
        ? null
        : {
            algorithm: "sha-256",
            value: input.previous_attestation_digest,
          },
  };
  return {
    method: "POST",
    url: POPCORN_WITNESS_URL,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body_utf8: JSON.stringify(body),
  };
}

export async function popcornWitness(
  input: {
    digest: string;
    nonce: string;
    previous_attestation_digest?: string | null;
    approve_payment?: boolean;
  },
  dependencies: { fetch?: FetchLike; env?: NodeJS.ProcessEnv } = {},
) {
  const fetchImpl = dependencies.fetch ?? fetch;
  const request = witnessRequest(input);
  const dryRun = await challengeRequest(request, fetchImpl);
  if (input.approve_payment !== true) return dryRun;

  const paid = await paidRequest(request, fetchImpl, dependencies.env ?? process.env);
  if (!isRecord(paid.paid_response) || !isRecord(paid.paid_response.witness_receipt)) {
    throw new Error("paid witness response is missing witness_receipt");
  }
  const receipt = paid.paid_response.witness_receipt;
  if (
    typeof receipt.payment_transaction !== "string" ||
    receipt.payment_transaction.length === 0 ||
    !Number.isSafeInteger(receipt.server_processing_duration_ms)
  ) {
    throw new Error("paid witness response is missing settlement or timing data");
  }
  return {
    payment_sent: true,
    request,
    settlement_tx_hash: receipt.payment_transaction,
    server_processing_duration_ms: receipt.server_processing_duration_ms,
    payment_response: paid.payment_response,
    payment_response_decoded: paid.payment_response_decoded,
    response: paid.paid_response,
  };
}
