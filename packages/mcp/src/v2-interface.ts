import {
  verifyPopcornWitnessEvidence,
  type JsonWebKeySet,
  type PopcornWitnessResponse,
} from "../../../verify/typescript/src/v2.js";

export type VerifyV2Input = {
  response: PopcornWitnessResponse;
  jwks: JsonWebKeySet;
  expected_nonce: string;
  expected_payload_base64url: string;
  expected_node_id?: string;
  max_clock_accuracy_radius_ms?: number;
};

export type VerifyV2Outcome = {
  accepted: boolean;
  reason: string;
  protocol_id: "POPCORN-WITNESS/2.0";
  authorization_granted: false;
  receipt_id?: string;
  tain?: string;
};

/** Shared fail-closed verification entry point for the local CLI and MCP tool. */
export async function verifyV2(input: VerifyV2Input): Promise<VerifyV2Outcome> {
  const base = {
    protocol_id: "POPCORN-WITNESS/2.0" as const,
    authorization_granted: false as const,
  };
  try {
    const encoded = input?.expected_payload_base64url;
    if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new Error("expected_payload_base64url must be canonical unpadded base64url");
    }
    const payload = Buffer.from(encoded, "base64url");
    if (payload.toString("base64url") !== encoded) {
      throw new Error("expected_payload_base64url must be canonical unpadded base64url");
    }
    const verified = await verifyPopcornWitnessEvidence(input.response, input.jwks, {
      expected_payload: payload,
      expected_nonce: input.expected_nonce,
      expected_node_id: input.expected_node_id,
      max_clock_accuracy_radius_ms: input.max_clock_accuracy_radius_ms,
    });
    return {
      ...base,
      accepted: true,
      reason: "signature, digest, time interval, and required fields verified",
      receipt_id: verified.witness_receipt.receipt_id,
      tain: verified.witness_receipt.tain,
    };
  } catch (error) {
    return {
      ...base,
      accepted: false,
      reason: error instanceof Error ? error.message : "verification failed",
    };
  }
}
