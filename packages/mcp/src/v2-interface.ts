import { createHash } from "node:crypto";

import {
  verifyPopcornWitnessEvidence,
  type JsonWebKeySet,
  type PopcornWitnessResponse,
  type WitnessVerificationOptions,
} from "../../../verify/typescript/src/v2.js";

export type VerifyV2Checks = {
  expected_nonce: string;
  expected_payload_digest?: string;
  /** Local use only. The remote MCP accepts a digest so payload bytes stay local. */
  expected_payload_base64url?: string;
  expected_node_id?: string;
  max_clock_accuracy_radius_ms?: number;
  /** An independently obtained RFC 7638 SHA-256 thumbprint for the selected issuer key. */
  expected_issuer_key_thumbprint_sha256?: string;
  previous_receipt?: {
    response: PopcornWitnessResponse;
    jwks: JsonWebKeySet;
    verification: VerifyV2Checks;
  };
};

export type VerifyV2Input = VerifyV2Checks & {
  response: PopcornWitnessResponse;
  jwks: JsonWebKeySet;
};

export type VerifyV2Outcome = {
  accepted: boolean;
  reason: string;
  protocol_id: "POPCORN-WITNESS/2.0";
  authorization_granted: false;
  issuer_key_trust_checked_by_tool: false;
  on_chain_settlement_checked_by_tool: false;
  receipt_id?: string;
  tain?: string;
  previous_attestation_digest_matched?: boolean;
};

const MAX_PREDECESSORS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExpectedIssuerKeyThumbprints(
  checks: VerifyV2Checks,
  response: PopcornWitnessResponse,
  jwks: JsonWebKeySet,
): void {
  const expected = checks.expected_issuer_key_thumbprint_sha256;
  if (expected !== undefined) {
    if (typeof expected !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(expected) ||
        Buffer.from(expected, "base64url").toString("base64url") !== expected) {
      throw new Error(
        "expected_issuer_key_thumbprint_sha256 must be a canonical unpadded base64url SHA-256 digest",
      );
    }

    // Select exactly the key the witness verifier will use: the first JWKS entry
    // whose kid matches the protected JWS header. Invalid headers and missing keys
    // retain the verifier's own rejection reason.
    const compact = isRecord(response) && isRecord(response.witness_attestation)
      ? response.witness_attestation.compact_jws
      : undefined;
    if (typeof compact === "string") {
      const encodedHeader = compact.split(".")[0];
      let header: unknown;
      try {
        header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
      } catch {
        header = undefined;
      }
      if (isRecord(header) && typeof header.kid === "string") {
        const key = jwks?.keys?.find(candidate => candidate.kid === header.kid);
        if (key) {
          if (key.kty !== "EC" || key.crv !== "P-256" ||
              typeof key.x !== "string" || typeof key.y !== "string") {
            throw new Error("JWKS key material does not match expected issuer key thumbprint");
          }
          const canonicalJwk = JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y });
          const actual = createHash("sha256").update(canonicalJwk, "utf8").digest("base64url");
          if (actual !== expected) {
            throw new Error("JWKS key material does not match expected issuer key thumbprint");
          }
        }
      }
    }
  }
  if (checks.previous_receipt !== undefined && isRecord(checks.previous_receipt)) {
    const previous = checks.previous_receipt;
    if (isRecord(previous.verification)) {
      assertExpectedIssuerKeyThumbprints(
        previous.verification as VerifyV2Checks,
        previous.response as PopcornWitnessResponse,
        previous.jwks as JsonWebKeySet,
      );
    }
  }
}

function verificationOptions(
  checks: VerifyV2Checks,
  depth: number,
  allowPayloadBytes: boolean,
): WitnessVerificationOptions {
  if (!isRecord(checks)) throw new Error("verification input must be an object");
  const hasDigest = checks.expected_payload_digest !== undefined;
  const hasPayload = checks.expected_payload_base64url !== undefined;
  if (hasDigest === hasPayload) {
    throw new Error("provide exactly one expected_payload_digest or expected_payload_base64url");
  }
  if (hasPayload && !allowPayloadBytes) {
    throw new Error("raw payload bytes are not accepted by the remote verifier");
  }
  const options: WitnessVerificationOptions = {
    expected_nonce: checks.expected_nonce,
    expected_node_id: checks.expected_node_id,
    max_clock_accuracy_radius_ms: checks.max_clock_accuracy_radius_ms,
  };
  if (hasDigest) {
    const digest = checks.expected_payload_digest;
    if (typeof digest !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(digest) ||
        Buffer.from(digest, "base64url").toString("base64url") !== digest) {
      throw new Error("expected_payload_digest must be a canonical unpadded base64url SHA-256 digest");
    }
    options.expected_payload_digest = digest;
  } else {
    const encoded = checks.expected_payload_base64url;
    if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]+$/.test(encoded) ||
        Buffer.from(encoded, "base64url").toString("base64url") !== encoded) {
      throw new Error("expected_payload_base64url must be canonical unpadded base64url");
    }
    options.expected_payload = Buffer.from(encoded, "base64url");
  }
  if (checks.previous_receipt !== undefined) {
    if (depth >= MAX_PREDECESSORS) {
      throw new Error(`previous_receipt chain exceeds ${MAX_PREDECESSORS} links`);
    }
    const previous = checks.previous_receipt;
    if (!isRecord(previous)) throw new Error("previous_receipt must be an object");
    options.previous_receipt = {
      response: previous.response,
      jwks: previous.jwks,
      verification: verificationOptions(previous.verification, depth + 1, allowPayloadBytes),
    };
  }
  return options;
}

/** Shared fail-closed verification entry point for the local CLI and MCP tool. */
export async function verifyV2(
  input: VerifyV2Input,
  { allowPayloadBytes = true }: { allowPayloadBytes?: boolean } = {},
): Promise<VerifyV2Outcome> {
  const base = {
    protocol_id: "POPCORN-WITNESS/2.0" as const,
    authorization_granted: false as const,
    issuer_key_trust_checked_by_tool: false as const,
    on_chain_settlement_checked_by_tool: false as const,
  };
  try {
    const options = verificationOptions(input, 0, allowPayloadBytes);
    assertExpectedIssuerKeyThumbprints(input, input.response, input.jwks);
    const verified = await verifyPopcornWitnessEvidence(
      input.response,
      input.jwks,
      options,
    );
    return {
      ...base,
      accepted: true,
      reason: "signature, digest, time interval, and required fields verified",
      receipt_id: verified.witness_receipt.receipt_id,
      tain: verified.witness_receipt.tain,
      previous_attestation_digest_matched: verified.previous_attestation_digest_matched,
    };
  } catch (error) {
    return {
      ...base,
      accepted: false,
      reason: error instanceof Error ? error.message : "verification failed",
    };
  }
}
