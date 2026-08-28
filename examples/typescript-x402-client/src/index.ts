import { performance } from "node:perf_hooks";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

import {
  verifyPopcornTemporalEvidence,
  type JsonWebKeySet,
  type PopcornResponse,
} from "../../../verify/typescript/src/index.js";

const RESOURCE = "https://767-2676.com/v1/time?freshness_ms=30000";
const JWKS_URL = "https://767-2676.com/.well-known/popcorn-keys.json";

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
  const jwksResponse = await fetch(JWKS_URL, { cache: "no-store" });
  if (!jwksResponse.ok) {
    throw new Error(`JWKS request failed with HTTP ${jwksResponse.status}`);
  }
  const jwks = (await jwksResponse.json()) as JsonWebKeySet;
  const verified = await verifyPopcornTemporalEvidence(body, jwks, {
    // wrapFetchWithPayment does not expose the exact paid-retry start. Timing
    // the whole operation is a safe, deliberately conservative upper bound.
    paid_request_start_monotonic_ms: started,
    paid_response_receive_monotonic_ms: received,
    decision_monotonic_ms: received,
  });

  console.log(
    JSON.stringify(
      {
        anchor_id: verified.temporal_receipt.anchor_id,
        signature_verified: verified.signature_verified,
        temporal_interval_utc: verified.temporal_interval_now_utc,
        uncertainty_upper_bound_ms: Math.ceil(verified.network_uncertainty_ms),
        conservative_remaining_validity_ms: Math.floor(
          verified.remaining_validity_now_ms,
        ),
        evidence_scope: verified.temporal_receipt.evidence_scope,
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
