import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { verifyV2, type VerifyV2Input } from "../src/v2-interface.js";

const jsonObject = z.record(z.string(), z.unknown());

function createRemoteServer(): McpServer {
  const server = new McpServer({ name: "popcorn-tain-verifier", version: "2.0.0" });
  server.registerTool(
    "popcorn_verify_v2",
    {
      title: "Verify a TAIN 2.0 witness receipt",
      description:
        "Verify a POPCORN-WITNESS/2.0 receipt against exact expected payload bytes, nonce, and issuer keys established independently of the receipt. This checks signed evidence only: it does not prove on-chain settlement, establish current time, or grant authority. Free and read-only.",
      inputSchema: z.strictObject({
        response: jsonObject,
        jwks: jsonObject,
        expected_nonce: z.string(),
        expected_payload_base64url: z.string(),
        expected_node_id: z.string().optional(),
        max_clock_accuracy_radius_ms: z.number().int().min(0).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const outcome = await verifyV2(input as VerifyV2Input);
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
