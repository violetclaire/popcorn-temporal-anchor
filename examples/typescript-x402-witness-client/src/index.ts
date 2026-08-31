import { createHash, randomBytes } from "node:crypto";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

import {
  verifyPopcornWitnessEvidence,
  type JsonWebKeySet,
  type PopcornWitnessResponse,
} from "../../../verify/typescript/src/index.js";

const RESOURCE =
  process.env.POPCORN_WITNESS_URL ?? "https://767-2676.com/v1/receipt";
const JWKS_URL = "https://767-2676.com/.well-known/popcorn-keys.json";

function sha256Base64Url(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("base64url");
}

async function main(): Promise<void> {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Set EVM_PRIVATE_KEY to a dedicated Base EVM private key");
  }

  // These are the exact bytes the agent keeps locally as its memory checkpoint.
  // POPCORN receives only their digest.
  const payload = JSON.stringify({
    checkpoint_id: crypto.randomUUID(),
    action_id: "handoff-example",
    state: "ready_for_handoff",
    version: 1,
  });
  const payloadBytes = new TextEncoder().encode(payload);
  const nonce = randomBytes(32).toString("base64url");
  const previousAttestation = process.env.PREVIOUS_COMPACT_JWS || undefined;
  const request = {
    payload_digest: {
      algorithm: "sha-256" as const,
      value: sha256Base64Url(payloadBytes),
    },
    nonce,
    previous_attestation_digest: previousAttestation
      ? {
          algorithm: "sha-256" as const,
          value: sha256Base64Url(previousAttestation),
        }
      : null,
  };

  const signer = privateKeyToAccount(privateKey as `0x${string}`);
  const client = new x402Client()
    .register("eip155:*", new ExactEvmScheme(signer))
    .setSpendControls({ maxAmountPerPayment: "$0.001" });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(RESOURCE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`POPCORN witness request failed with HTTP ${response.status}`);
  }
  if (!response.headers.get("payment-response")) {
    throw new Error("successful response is missing PAYMENT-RESPONSE");
  }

  const body = (await response.json()) as PopcornWitnessResponse;
  const jwksResponse = await fetch(JWKS_URL, { cache: "no-store" });
  if (!jwksResponse.ok) {
    throw new Error(`JWKS request failed with HTTP ${jwksResponse.status}`);
  }
  const jwks = (await jwksResponse.json()) as JsonWebKeySet;
  const verified = await verifyPopcornWitnessEvidence(body, jwks, {
    expected_payload: payloadBytes,
    expected_nonce: nonce,
    expected_previous_attestation: previousAttestation,
  });

  // The consuming agent must store replay_key after accepting this checkpoint.
  // POPCORN does not centrally enforce nonce uniqueness or action idempotency.
  console.log(
    JSON.stringify(
      {
        receipt_id: verified.witness_receipt.receipt_id,
        signature_verified: verified.signature_verified,
        payload_digest_verified: verified.payload_digest_verified,
        nonce_verified: verified.nonce_verified,
        previous_attestation_digest_matched:
          verified.previous_attestation_digest_matched,
        witness_window_utc: verified.witness_window_utc,
        replay_key: verified.replay_key,
        payload_remained_local: true,
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
