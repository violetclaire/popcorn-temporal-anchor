import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  popcornCatalog,
  popcornHash,
  popcornTime,
  popcornVerify,
  popcornWitness,
} from "./core.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function result(value: unknown): ToolResult {
  const structuredContent = value as Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

function failure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : "POPCORN tool failed";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message, authorization_granted: false },
  };
}

async function handle(work: () => unknown | Promise<unknown>): Promise<ToolResult> {
  try {
    return result(await work());
  } catch (error) {
    return failure(error);
  }
}

const jsonObject = z.record(z.string(), z.unknown());

export function createServer(): McpServer {
  const server = new McpServer({
    name: "popcorn",
    version: "0.1.0",
  });

  server.registerTool(
    "popcorn_catalog",
    {
      title: "Read POPCORN catalog",
      description:
        "Fetch the live POPCORN service catalog, published verification keys, and public schemas. Free. Makes no payment.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => handle(() => popcornCatalog()),
  );

  server.registerTool(
    "popcorn_hash",
    {
      title: "Hash exact payload bytes",
      description:
        "Compute SHA-256 locally over exact UTF-8 text or canonical unpadded base64url bytes. Free, local, and makes no network request or payment.",
      inputSchema: z.object({
        payload_text: z
          .string()
          .optional()
          .describe("Exact UTF-8 text to hash. Mutually exclusive with payload_base64url."),
        payload_base64url: z
          .string()
          .optional()
          .describe(
            "Exact bytes as canonical unpadded base64url. Mutually exclusive with payload_text.",
          ),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) => handle(() => popcornHash(input)),
  );

  server.registerTool(
    "popcorn_verify",
    {
      title: "Verify a POPCORN receipt offline",
      description:
        "Verify a POPCORN time or witness receipt locally against caller-supplied JWKS and expected values. Free and network-free. For chained witness receipts, verification.previous_receipt must recursively contain response, jwks, and verification.",
      inputSchema: z.object({
        receipt_type: z.enum(["time", "witness"]),
        response: jsonObject.describe("The full POPCORN response envelope."),
        jwks: jsonObject.describe("The independently obtained POPCORN JWKS."),
        verification: jsonObject.describe(
          "For time: observation and optional policy. For witness: expected_nonce, exactly one expected payload form, optional expected_node_id, maximum clock radius, and optional verified predecessor chain.",
        ),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) => handle(() => popcornVerify(input)),
  );

  server.registerTool(
    "popcorn_time",
    {
      title: "Request signed POPCORN time",
      description:
        "Fetch signed time through x402. Defaults to a no-payment dry run that returns the 402 terms and exact request. A payment can occur only when approve_payment is exactly true, using EVM_PRIVATE_KEY from the server environment. Maximum payment is $0.001 USDC on Base.",
      inputSchema: z.object({
        freshness_ms: z
          .number()
          .int()
          .min(100)
          .max(60_000)
          .default(30_000)
          .describe("Requested freshness window. Default 30000 ms."),
        approve_payment: z
          .boolean()
          .default(false)
          .describe("Must be exactly true to authorize one $0.001 payment."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input) => handle(() => popcornTime(input)),
  );

  server.registerTool(
    "popcorn_witness",
    {
      title: "Request a signed POPCORN payload witness",
      description:
        "Witness a SHA-256 digest through x402. Defaults to a no-payment dry run that returns the 402 terms and exact request. A payment can occur only when approve_payment is exactly true, using EVM_PRIVATE_KEY from the server environment. Maximum payment is $0.001 USDC on Base.",
      inputSchema: z.object({
        digest: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .describe("SHA-256 payload digest as canonical unpadded base64url."),
        nonce: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .describe("Caller-generated 32-byte nonce as canonical unpadded base64url."),
        previous_attestation_digest: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .nullable()
          .optional()
          .describe(
            "SHA-256 of the predecessor compact JWS decoded signed payload bytes, or null to start a chain.",
          ),
        approve_payment: z
          .boolean()
          .default(false)
          .describe("Must be exactly true to authorize one $0.001 payment."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input) => handle(() => popcornWitness(input)),
  );

  return server;
}
