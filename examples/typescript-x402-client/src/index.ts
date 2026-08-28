import { performance } from "node:perf_hooks";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const RESOURCE = "https://767-2676.com/v1/time?freshness_ms=30000";
const JWKS_URL = "https://767-2676.com/.well-known/popcorn-keys.json";

type TemporalReceipt = {
  anchor_id: string;
  measurement_at_utc: string;
  request_received_at_utc: string;
  observed_at_utc: string;
  valid_until_utc: string;
  server_processing_duration_ms: number;
  post_anchor_processing_duration_ms: number;
  validity_at_measurement_ms: number;
  evidence_scope: {
    type: string;
    authorization_granted: boolean;
  };
};

type PopcornResponse = {
  temporal_receipt: TemporalReceipt;
  temporal_attestation: {
    compact_jws: string;
  };
};

function decodeBase64Url(value: string): ArrayBuffer {
  const decoded = Buffer.from(value, "base64url");
  const copy = new Uint8Array(new ArrayBuffer(decoded.length));
  copy.set(decoded);
  return copy.buffer;
}

function requireEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} relationship is invalid`);
  }
}

async function verifyTemporalReceipt(body: PopcornResponse): Promise<void> {
  const compact = body.temporal_attestation.compact_jws;
  const [encodedHeader, encodedPayload, encodedSignature] = compact.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("temporal_attestation.compact_jws is malformed");
  }

  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "ES256" || !header.kid) {
    throw new Error("unsupported or missing JWS protected header");
  }

  const jwksResponse = await fetch(JWKS_URL, { cache: "no-store" });
  if (!jwksResponse.ok) {
    throw new Error(`JWKS request failed with HTTP ${jwksResponse.status}`);
  }
  const jwks = (await jwksResponse.json()) as {
    keys?: Array<JsonWebKey & { kid?: string }>;
  };
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    throw new Error(`signing key ${header.kid} is not present in the JWKS`);
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) {
    throw new Error("ES256 temporal receipt signature is invalid");
  }

  const signedReceipt = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as TemporalReceipt;
  if (JSON.stringify(signedReceipt) !== JSON.stringify(body.temporal_receipt)) {
    throw new Error("response temporal_receipt does not match the signed payload");
  }

  const measurement = Date.parse(signedReceipt.measurement_at_utc);
  const requestReceived = Date.parse(signedReceipt.request_received_at_utc);
  const observed = Date.parse(signedReceipt.observed_at_utc);
  const validUntil = Date.parse(signedReceipt.valid_until_utc);
  for (const [label, value] of Object.entries({
    measurement,
    requestReceived,
    observed,
    validUntil,
  })) {
    if (!Number.isFinite(value)) throw new Error(`${label} is not valid UTC`);
  }

  requireEqual(
    measurement - requestReceived,
    signedReceipt.server_processing_duration_ms,
    "server_processing_duration_ms",
  );
  requireEqual(
    measurement - observed,
    signedReceipt.post_anchor_processing_duration_ms,
    "post_anchor_processing_duration_ms",
  );
  requireEqual(
    validUntil - measurement,
    signedReceipt.validity_at_measurement_ms,
    "validity_at_measurement_ms",
  );
  if (
    signedReceipt.evidence_scope.type !== "bearer_temporal_evidence" ||
    signedReceipt.evidence_scope.authorization_granted !== false
  ) {
    throw new Error("unexpected temporal evidence scope");
  }
}

async function main(): Promise<void> {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Set EVM_PRIVATE_KEY to a dedicated Base EVM private key");
  }

  const signer = privateKeyToAccount(privateKey as `0x${string}`);
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const started = performance.now();
  const response = await fetchWithPayment(RESOURCE, { method: "GET" });
  const received = performance.now();
  if (!response.ok) {
    throw new Error(`POPCORN request failed with HTTP ${response.status}`);
  }
  if (!response.headers.get("payment-response")) {
    throw new Error("successful response is missing PAYMENT-RESPONSE");
  }

  const body = (await response.json()) as PopcornResponse;
  await verifyTemporalReceipt(body);

  const operationRttUpperBoundMs = Math.max(0, received - started);
  const signedServerMs = body.temporal_receipt.server_processing_duration_ms;
  const uncertaintyMs = Math.max(
    0,
    operationRttUpperBoundMs - Math.min(signedServerMs, operationRttUpperBoundMs),
  );
  const conservativeRemainingValidityMs = Math.max(
    0,
    body.temporal_receipt.validity_at_measurement_ms - uncertaintyMs,
  );
  const earliestUtc = body.temporal_receipt.measurement_at_utc;
  const latestUtc = new Date(
    Date.parse(earliestUtc) + uncertaintyMs,
  ).toISOString();

  console.log(
    JSON.stringify(
      {
        anchor_id: body.temporal_receipt.anchor_id,
        signature_verified: true,
        temporal_interval_utc: {
          earliest: earliestUtc,
          latest: latestUtc,
        },
        uncertainty_upper_bound_ms: Math.ceil(uncertaintyMs),
        conservative_remaining_validity_ms: Math.floor(
          conservativeRemainingValidityMs,
        ),
        evidence_scope: body.temporal_receipt.evidence_scope,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
