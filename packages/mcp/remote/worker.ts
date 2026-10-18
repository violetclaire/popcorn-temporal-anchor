import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { verifyV2, type VerifyV2Input } from "../src/v2-interface.js";
import { remoteVerifyV2Schema } from "../src/v2-schema.js";

function createRemoteServer(): McpServer {
  const server = new McpServer({ name: "popcorn-tain-verifier", version: "2.0.0" });
  server.registerTool(
    "popcorn_verify_v2",
    {
      title: "Verify a TAIN 2.0 witness receipt",
      description:
        "Verify a POPCORN-WITNESS/2.0 receipt against a caller-computed SHA-256 payload digest, nonce, and independently trusted issuer keys. Send only the digest, never private payload bytes. Caller-supplied keys do not establish issuer identity. This does not prove on-chain settlement, establish current time, or grant authority. Free and read-only.",
      inputSchema: remoteVerifyV2Schema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      // Fetch trusted keys from the fixed issuer origin, not from the receipt or caller.
      // Fail closed if the issuer keys are unavailable, malformed, or redirected.
      let outcome;
      try {
        const keysResponse = await fetch("https://767-2676.com/.well-known/popcorn-keys.json", {
          redirect: "manual",
          headers: { accept: "application/json" },
        });
        if (!keysResponse.ok) throw new Error("issuer JWKS endpoint unavailable");
        const jwks: unknown = await keysResponse.json();
        if (!jwks || typeof jwks !== "object" || !Array.isArray((jwks as { keys?: unknown }).keys)) {
          throw new Error("issuer JWKS is malformed");
        }
        outcome = await verifyV2(
          { ...(input as VerifyV2Input), jwks: jwks as VerifyV2Input["jwks"] },
          { allowPayloadBytes: false, issuerKeysFetchedByTool: true },
        );
      } catch (error) {
        outcome = {
          accepted: false,
          reason: error instanceof Error ? error.message : "issuer key verification failed",
          protocol_id: "POPCORN-WITNESS/2.0" as const,
          authorization_granted: false as const,
          issuer_key_trust_checked_by_tool: false as const,
          on_chain_settlement_checked_by_tool: false as const,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(outcome) }],
        structuredContent: outcome,
      };
    },
  );
  return server;
}

const mcp = createMcpHandler(createRemoteServer);

export default {
  fetch(request: Request): Promise<Response> | Response {
    if (new URL(request.url).pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }
    return mcp.fetch(request);
  },
};
