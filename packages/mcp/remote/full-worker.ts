import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { popcornHash, popcornVerify } from "../src/core.js";
import { verifyV2, type VerifyV2Input } from "../src/v2-interface.js";
import { remoteVerifyV2Schema } from "../src/v2-schema.js";
import sampleReceipt from "./fixtures/popcorn-receipt.json" with { type: "json" };
import sampleKeys from "./fixtures/popcorn-keys.json" with { type: "json" };

const ORIGIN = "https://767-2676.com";
const NETWORK = "eip155:8453";
const ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x5f5a631e975183d084f60d7121e967b30ec83cb8";
const MAX_BODY = 131072;
const record = z.record(z.string(), z.unknown());
const digest = z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine(v => Buffer.from(v, "base64url").toString("base64url") === v, "Noncanonical digest or nonce");
const payment = {
  approve_payment: z.boolean().default(false),
  payment_signature: z.string().max(16384).optional().describe("Caller-signed x402 PAYMENT-SIGNATURE. Never send a wallet private key. Requires approve_payment:true for this single call."),
};
type Json = Record<string, unknown>;
export type Env = { POPCORN: { fetch(request: Request): Promise<Response> } };
type Upstream = (request: Request) => Promise<Response>;
const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

function output(value: Json) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value };
}
async function handle(work: () => Promise<Json> | Json) {
  try { return output(await work()); }
  catch (error) {
    return { ...output({ error: error instanceof Error ? error.message : "Request failed", authorization_granted: false }), isError: true };
  }
}
async function readJson(response: Response): Promise<Json> {
  const text = await response.text();
  if (text.length > 1048576) throw new Error("Upstream response exceeds limit");
  const body: unknown = JSON.parse(text);
  if (!isObject(body)) throw new Error("Upstream response must be a JSON object");
  return body;
}
function fixedRequest(path: string, init?: RequestInit) {
  return new Request(ORIGIN + path, { redirect: "manual", signal: AbortSignal.timeout(20000), ...init });
}
async function get(upstream: Upstream, path: string) {
  const response = await upstream(fixedRequest(path, { headers: { accept: "application/json" } }));
  if (!response.ok) throw new Error(`Public resource returned HTTP ${response.status}`);
  return readJson(response);
}
function decodeHeader(value: string): Json {
  const bytes = Buffer.from(value, "base64");
  if (value !== bytes.toString("base64") && value !== bytes.toString("base64url")) throw new Error("Noncanonical x402 header");
  const body: unknown = JSON.parse(bytes.toString("utf8"));
  if (!isObject(body)) throw new Error("Invalid x402 header");
  return body;
}
function lockedOption(value: unknown) {
  if (!isObject(value) || value.scheme !== "exact" || value.network !== NETWORK || value.amount !== "1000" ||
      typeof value.asset !== "string" || value.asset.toLowerCase() !== ASSET.toLowerCase() ||
      typeof value.payTo !== "string" || value.payTo.toLowerCase() !== PAY_TO) {
    throw new Error("Payment must be exactly $0.001 USDC on Base to POPCORN");
  }
}

/** Forward only an explicitly approved, caller-signed proof, once. No server wallet exists. */
export async function requestReceipt(upstream: Upstream, path: string, body: Json | null,
  approval: { approve_payment: boolean; payment_signature?: string }): Promise<Json> {
  if (approval.payment_signature && !approval.approve_payment) throw new Error("Payment proof requires explicit approval for this call");
  if (approval.approve_payment && !approval.payment_signature) throw new Error("Sign the dry-run x402 challenge with your own wallet and supply payment_signature; never send a private key");
  const url = ORIGIN + path;
  if (approval.payment_signature) {
    const proof = decodeHeader(approval.payment_signature);
    if (proof.x402Version !== 2) throw new Error("Expected x402 version 2 payment proof");
    lockedOption(proof.accepted);
    if (!isObject(proof.resource) || proof.resource.url !== url) throw new Error("Payment proof resource differs from this request");
    if (!isObject(proof.payload)) throw new Error("Missing signed payment payload");
  }
  const init: RequestInit = { method: body ? "POST" : "GET", headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
  const challenge = await upstream(fixedRequest(path, init));
  if (challenge.status !== 402) throw new Error(`Expected an unpaid 402 challenge, received ${challenge.status}`);
  const header = challenge.headers.get("payment-required");
  if (!header) throw new Error("Missing PAYMENT-REQUIRED");
  const terms = decodeHeader(header);
  if (terms.x402Version !== 2 || !isObject(terms.resource) || terms.resource.url !== url || !Array.isArray(terms.accepts) || terms.accepts.length !== 1) throw new Error("Unexpected x402 challenge");
  lockedOption(terms.accepts[0]);
  const challengeBody = await readJson(challenge);
  const request = { url, method: init.method, body_utf8: body ? JSON.stringify(body) : null };
  if (!approval.approve_payment) return {
    payment_sent: false, authorization_granted: false, request,
    challenge: { status: 402, payment_required: header, decoded_terms: terms, response_body: challengeBody },
    next_step: "Only with owner approval, sign this challenge locally and repeat this tool call with approve_payment:true and payment_signature. No wallet keys belong on this server.",
  };
  // Never retry a submitted proof: a timeout can occur after settlement.
  try {
    const headers = new Headers(init.headers);
    headers.set("PAYMENT-SIGNATURE", approval.payment_signature!);
    const response = await upstream(fixedRequest(path, { ...init, headers }));
    const result = await readJson(response);
    const paymentResponse = response.headers.get("payment-response");
    const settled = paymentResponse ? decodeHeader(paymentResponse) : null;
    const receipt = result.witness_receipt ?? result.temporal_receipt;
    const settlementReported = response.ok && settled?.success === true && settled.network === NETWORK &&
      typeof settled.transaction === "string" && /^0x[0-9a-fA-F]{64}$/.test(settled.transaction) &&
      isObject(receipt) && receipt.payment_transaction === settled.transaction;
    return { payment_proof_submitted: true, settlement_reported_by_issuer: settlementReported,
      http_status: response.status, request, response: result, payment_response: paymentResponse,
      settlement_status: settlementReported ? "reported_settled" : "unconfirmed",
      receipt_signature_checked_by_tool: false, on_chain_settlement_checked_by_tool: false,
      authorization_granted: false, do_not_retry_automatically: true,
      next_step: "Retain this response. Verify its receipt before relying on it; do not automatically repeat a submitted payment proof." };
  } catch {
    return { payment_proof_submitted: true, settlement_status: "unknown", authorization_granted: false,
      do_not_retry_automatically: true, error: "Response unavailable after submitting payment proof. Check settlement and retained evidence before taking further action." };
  }
}

function boundVerification(value: unknown, depth = 0): void {
  if (!isObject(value)) throw new Error("Invalid verification object");
  if ("expected_payload_text" in value || "expected_payload_base64url" in value) throw new Error("Remote verification accepts digests only; keep private payload bytes local");
  if (value.previous_receipt !== undefined) {
    if (depth >= 8 || !isObject(value.previous_receipt)) throw new Error("Invalid or excessive predecessor chain");
    boundVerification(value.previous_receipt.verification, depth + 1);
  }
}
function trustedInput(input: VerifyV2Input, jwks: VerifyV2Input["jwks"]): VerifyV2Input {
  const copy = structuredClone(input);
  copy.jwks = jwks;
  let checks = copy;
  while (checks.previous_receipt) {
    checks.previous_receipt.jwks = jwks;
    checks = checks.previous_receipt.verification as VerifyV2Input;
  }
  return copy;
}
export function createFullServer(upstream: Upstream) {
  const server = new McpServer({ name: "popcorn", version: "0.1.4-remote" }, { maxToolInputElements: 10000 });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("popcorn_sample", {
    title: "Verify a real receipt for free", description: "Check the public October 14 TAIN 2.0 receipt and a changed-digest control. No inputs, wallet, payment, or outbound request. Historical evidence, not a fresh clock. Bundled sample keys do not independently establish issuer identity.",
    inputSchema: z.strictObject({}), annotations: readOnly,
  }, async () => handle(async () => {
    const input = { response: sampleReceipt, jwks: sampleKeys, expected_nonce: sampleReceipt.witness_receipt.commitment.nonce, expected_payload_digest: sampleReceipt.witness_receipt.commitment.payload_digest.value } as VerifyV2Input;
    const genuine = await verifyV2(input, { allowPayloadBytes: false });
    const changedDigest = await verifyV2({ ...input, expected_payload_digest: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, { allowPayloadBytes: false });
    return { payment_sent: false, sample_date: "2026-10-14", genuine, changed_digest_control: changedDigest, passed: genuine.accepted && !changedDigest.accepted, current_time_established: false, authorization_granted: false };
  }));
  server.registerTool("popcorn_catalog", {
    description: "Read the live catalog, offer, and published verification keys. Free; no payment.", inputSchema: z.strictObject({}), annotations: readOnly,
  }, async () => handle(async () => {
    const resources = await Promise.all(["/.well-known/ai-catalog.json", "/agent/offer", "/.well-known/popcorn-keys.json"].map(path => get(upstream, path)));
    return { payment_sent: false, canonical_origin: ORIGIN, catalog: resources[0], offer: resources[1], published_keys: resources[2] };
  }));
  server.registerTool("popcorn_hash", {
    description: "Hash public bytes on this remote server. Submitted text reaches the server: hash private work locally instead. Free; no onward request or payment.",
    inputSchema: z.strictObject({ payload_text: z.string().max(65536).optional(), payload_base64url: z.string().max(65536).optional() }), annotations: readOnly,
  }, async input => handle(() => popcornHash(input)));
  server.registerTool("popcorn_verify", {
    description: "Verify a time or witness receipt using caller-trusted JWKS and expected values. Digest-only for witness payloads. No outbound request or payment. Caller keys do not establish issuer identity; a signature grants no authority.",
    inputSchema: z.strictObject({ receipt_type: z.enum(["time", "witness"]), response: record, jwks: record, verification: record }), annotations: readOnly,
  }, async input => handle(async () => {
    boundVerification(input.verification);
    return { ...await popcornVerify(input), authorization_granted: false, issuer_key_trust_checked_by_tool: false, on_chain_settlement_checked_by_tool: false };
  }));
  server.registerTool("popcorn_verify_v2", {
    description: "Verify TAIN 2.0 evidence against keys fetched from the fixed POPCORN issuer URL. Caller jwks is replaced with published keys, including predecessors. Send a digest, never private work. Free; does not grant authority, establish current time, or verify settlement on chain.",
    inputSchema: remoteVerifyV2Schema, annotations: readOnly,
  }, async input => handle(async () => {
    const jwks = await get(upstream, "/.well-known/popcorn-keys.json");
    if (!Array.isArray(jwks.keys)) throw new Error("Malformed issuer keys");
    return verifyV2(trustedInput(input as VerifyV2Input, jwks as VerifyV2Input["jwks"]), { allowPayloadBytes: false, issuerKeysFetchedByTool: true });
  }));
  const paid = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
  server.registerTool("popcorn_time", {
    description: "Request signed current-time evidence. Defaults to a free unpaid 402 challenge. A fresh receipt costs exactly $0.001 USDC on Base. Payment requires owner approval, approve_payment:true, and a caller-signed payment_signature. No server wallet or private key. No automatic retry. Verify evidence and account for client round-trip time before a deadline decision.",
    inputSchema: z.strictObject({ freshness_ms: z.number().int().min(100).max(60000).default(30000), ...payment }), annotations: paid,
  }, async input => handle(() => requestReceipt(upstream, `/v1/time?freshness_ms=${input.freshness_ms}`, null, input)));
  server.registerTool("popcorn_witness", {
    description: "Witness a SHA-256 digest and fresh caller nonce at a time. Defaults to a free unpaid 402 challenge. One fresh receipt costs exactly $0.001 USDC on Base; requires owner approval, approve_payment:true, and caller-signed payment_signature. Keep work and wallet keys local. No automatic retry. Evidence does not authorize or prove execution of an action.",
    inputSchema: z.strictObject({ digest, nonce: digest, previous_attestation_digest: digest.nullable().optional(), ...payment }), annotations: paid,
  }, async input => handle(() => requestReceipt(upstream, "/v2/receipt", {
    payload_digest: { algorithm: "sha-256", value: input.digest }, nonce: input.nonce,
    previous_attestation_digest: input.previous_attestation_digest ? { algorithm: "sha-256", value: input.previous_attestation_digest } : null,
  }, input)));
  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!["767-2676.com", "popcorn-canonical-mcp.violetherod.workers.dev"].includes(url.hostname)) return new Response("Forbidden host", { status: 403 });
    // The /mcp* route must leave every other existing path unchanged.
    if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") return env.POPCORN.fetch(request);
    const origin = request.headers.get("origin");
    if (origin && ![ORIGIN, "https://popcorn-canonical-mcp.violetherod.workers.dev"].includes(origin)) return new Response("Forbidden origin", { status: 403 });
    const handler = createMcpHandler(() => createFullServer(req => env.POPCORN.fetch(req)), { maxRequestBodySize: MAX_BODY, legacy: "stateless" });
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  },
};
