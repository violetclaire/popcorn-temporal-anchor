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
      const outcome = await verifyV2(input as VerifyV2Input, { allowPayloadBytes: false });
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
