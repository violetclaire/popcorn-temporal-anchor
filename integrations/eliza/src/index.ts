import type { Action, ActionResult, IAgentRuntime, Memory, Plugin, State } from "@elizaos/core";
import { createPopcornClient, type HashInput, type PopcornClient, type VerifyInput, type WitnessInput } from "./client.js";
export * from "./client.js";

export type InputOperation = "POPCORN_HASH" | "POPCORN_VERIFY" | "POPCORN_WITNESS";
export interface InputContext {
  runtime: IAgentRuntime;
  message: Memory;
  state?: State;
}

export interface PopcornPluginOptions {
  client?: PopcornClient;
  /** Independently selected by the host, never taken from the receipt/command. */
  trustedJwks?: Record<string, unknown>;
  /** Override deterministic JSON command parsing for your application's own data. */
  resolveInput?: (operation: InputOperation, context: InputContext) => unknown | Promise<unknown>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`unsupported input fields: ${unknown.join(", ")}`);
}

/** Reads only the original message text: ACTION_NAME {one JSON object}. */
export function parsePopcornCommand(operation: InputOperation, text: unknown): Record<string, unknown> {
  if (typeof text !== "string") throw new Error(`expected ${operation} followed by one JSON object`);
  const command = text.trim();
  if (!new RegExp(`^${operation}\\s+`).test(command)) {
    throw new Error(`expected ${operation} followed by one JSON object`);
  }
  try {
    return object(JSON.parse(command.slice(operation.length).trim()), "command input");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("command must contain exactly one valid JSON object");
    throw error;
  }
}

/** Six free actions. Paid witness issuance remains an explicit host API call. */
export function createPopcornPlugin(options: PopcornPluginOptions = {}): Plugin {
  const client = options.client ?? createPopcornClient();
  const trustedJwks = options.trustedJwks === undefined ? undefined : structuredClone(options.trustedJwks);
  const input = async (operation: InputOperation, context: InputContext) => object(
    options.resolveInput
      ? await options.resolveInput(operation, context)
      : parsePopcornCommand(operation, context.message.content.text),
    "input",
  );

  function action(
    name: string,
    description: string,
    run: (context: InputContext) => Promise<unknown> | unknown,
    requiresInput = false,
  ): Action {
    return {
      name,
      description,
      examples: [],
      validate: async (_runtime, message) => !requiresInput || Boolean(options.resolveInput) ||
        (typeof message.content.text === "string" &&
         new RegExp(`^${name}\\s+\\{`).test(message.content.text.trim())),
      handler: async (runtime, message, state): Promise<ActionResult> => {
        try {
          const result = await run({ runtime, message, state });
          return {
            success: true,
            text: `${name} completed. No payment was sent; this result grants no task authority.`,
            data: { result, payment_sent: false, authorization_granted: false },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "POPCORN action failed",
            data: { payment_sent: false, authorization_granted: false },
          };
        }
      },
    };
  }

  return {
    name: "popcorn",
    description: "Briarwood POPCORN: free historical sample, discovery, exact hashing, local verification and no-payment witness quotes.",
    actions: [
      action("POPCORN_SAMPLE", "Run the bundled historical receipt and tamper checks offline. Free; this does not establish current time or authority.", () => client.sample()),
      action("POPCORN_HANDOFF", "Return a verified public historical evidence packet that another agent can check locally. Free and offline. This prepares data only; it sends no message and grants no task authority.", () => client.handoff()),
      action("POPCORN_CATALOG", "Read the current public POPCORN offer, keys and schemas. Free public GET requests; no wallet is used.", () => client.catalog()),
      action("POPCORN_HASH", "Hash exact bytes locally. Original message must be POPCORN_HASH followed by JSON with exactly one payload_text or payload_base64url. Do not paraphrase task content.", async (context) => {
        const value = await input("POPCORN_HASH", context);
        exactKeys(value, ["payload_text", "payload_base64url"]);
        if (value.payload_text !== undefined && typeof value.payload_text !== "string" ||
            value.payload_base64url !== undefined && typeof value.payload_base64url !== "string") {
          throw new Error("payload_text and payload_base64url must be strings");
        }
        return client.hash(value as HashInput);
      }, true),
      action("POPCORN_VERIFY", "Verify a full time or witness v1/v2 response locally. Original message must be POPCORN_VERIFY followed by JSON with receipt_type, response and verification. Issuer keys must be configured independently by the host.", async (context) => {
        if (!trustedJwks) throw new Error("host must configure independently trusted issuer JWKS before verification; use POPCORN_SAMPLE for the zero-configuration demo");
        const value = await input("POPCORN_VERIFY", context);
        exactKeys(value, ["receipt_type", "response", "verification"]);
        if (value.receipt_type !== "time" && value.receipt_type !== "witness") {
          throw new Error("receipt_type must be time or witness");
        }
        const verification = object(value.verification, "verification");
        // Chained receipts also need independently selected keys at every level.
        const bindKeys = (entry: Record<string, unknown>, depth = 0): Record<string, unknown> => {
          if (depth > 8) throw new Error("previous receipt chain exceeds 8 levels");
          if (entry.previous_receipt === undefined) return entry;
          const previous = object(entry.previous_receipt, "previous_receipt");
          exactKeys(previous, ["response", "verification"]);
          return { ...entry, previous_receipt: {
            response: object(previous.response, "previous_receipt.response"),
            jwks: trustedJwks,
            verification: bindKeys(object(previous.verification, "previous_receipt.verification"), depth + 1),
          } };
        };
        return client.verify({
          receipt_type: value.receipt_type,
          response: object(value.response, "response"),
          jwks: trustedJwks,
          verification: bindKeys(verification),
        } as VerifyInput);
      }, true),
      action("POPCORN_WITNESS", "Get an unpaid HTTP 402 quote for a digest and nonce. Original message must be POPCORN_WITNESS followed by JSON with digest, nonce and optional previous_attestation_digest. Never issues a paid receipt; approve_payment is rejected.", async (context) => {
        const value = await input("POPCORN_WITNESS", context);
        exactKeys(value, ["digest", "nonce", "previous_attestation_digest"]);
        return client.quoteWitness(value as WitnessInput);
      }, true),
    ],
  };
}

export default createPopcornPlugin();
