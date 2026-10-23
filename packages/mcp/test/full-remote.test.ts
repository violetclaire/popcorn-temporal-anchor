import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import worker, { requestReceipt, type Env } from "../remote/full-worker.js";
import { requestRpc } from "../remote/http-smoke.js";

const endpoint = "https://767-2676.com/mcp";
const option = { scheme: "exact", network: "eip155:8453", amount: "1000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x5f5a631e975183d084f60d7121e967b30ec83cb8", maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } };
const terms = { x402Version: 2, resource: { url: "https://767-2676.com/v2/receipt" }, accepts: [option] };
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");
const now = Math.floor(Date.now() / 1000);
// Synthetic EOA shape for forwarding tests only. No real signature or funds.
const payload = { signature: "0x" + "11".repeat(65), authorization: { from: "0x" + "22".repeat(20), to: option.payTo, value: "1000", nonce: "0x" + "33".repeat(32), validAfter: "0", validBefore: String(now + 120) } };
const proof = encode({ x402Version: 2, resource: terms.resource, accepted: option, payload });
const challenge = (t: unknown = terms) => new Response(JSON.stringify(t), { status: 402, headers: { "payment-required": encode(t) } });
const fixture = JSON.parse(await readFile(new URL("../remote/fixtures/popcorn-receipt.json", import.meta.url), "utf8"));
const jwks = JSON.parse(await readFile(new URL("../remote/fixtures/popcorn-keys.json", import.meta.url), "utf8"));

test("GET /mcp returns the small server card without invoking tools or upstream", async () => {
  let calls = 0;
  const env: Env = { POPCORN: { fetch: async () => { calls++; throw Error("GET card must not call upstream"); } } };
  for (const accept of [undefined, "application/json", "text/event-stream"]) {
    const response = await worker.fetch(new Request(endpoint, { headers: accept ? { accept } : {} }), env);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json(?:;|$)/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const body = await response.text();
    assert.ok(Buffer.byteLength(body) < 2048, "card must stay small");
    assert.deepEqual(JSON.parse(body), {
      name: "popcorn",
      version: "0.1.4-remote",
      transport: "MCP calls use POST JSON-RPC 2.0 at this URL; GET only returns this server card.",
      tools: ["popcorn_sample", "popcorn_catalog", "popcorn_hash", "popcorn_verify", "popcorn_verify_v2", "popcorn_time", "popcorn_witness"],
      pointers: ["https://767-2676.com/.well-known/mcp.json", "https://767-2676.com/.well-known/agent-card.json", "https://767-2676.com/ai-catalog.json", "https://767-2676.com/SKILL.md", "https://767-2676.com/agent-entry"],
    });
  }
  assert.equal(calls, 0);
});

test("canonical HTTP initializes, lists all tools, verifies sample and live-origin keys, rejects tamper", async () => {
  const requests: string[] = [];
  const env: Env = { POPCORN: { fetch: async req => {
    requests.push(req.url);
    assert.equal(req.url, "https://767-2676.com/.well-known/popcorn-keys.json");
    assert.equal(req.redirect, "manual");
    return Response.json(jwks);
  } } };
  const send = (req: Request) => worker.fetch(req, env);
  const initialized = await requestRpc(endpoint, send, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal((initialized.serverInfo as { name: string }).name, "popcorn");
  const listed = await requestRpc(endpoint, send, 2, "tools/list", {});
  assert.deepEqual((listed.tools as { name: string }[]).map(t => t.name).sort(), ["popcorn_catalog", "popcorn_hash", "popcorn_sample", "popcorn_time", "popcorn_verify", "popcorn_verify_v2", "popcorn_witness"]);
  const sample = await requestRpc(endpoint, send, 3, "tools/call", { name: "popcorn_sample", arguments: {} });
  assert.equal((sample.structuredContent as { passed: boolean }).passed, true);
  assert.equal(requests.length, 0, "sample must make no outgoing request");
  const input = { response: fixture, jwks: { keys: [] }, expected_nonce: fixture.witness_receipt.commitment.nonce, expected_payload_digest: fixture.witness_receipt.commitment.payload_digest.value };
  const verified = await requestRpc(endpoint, send, 4, "tools/call", { name: "popcorn_verify_v2", arguments: input });
  assert.equal((verified.structuredContent as { accepted: boolean }).accepted, true);
  assert.equal((verified.structuredContent as { issuer_key_trust_checked_by_tool: boolean }).issuer_key_trust_checked_by_tool, true);
  const tampered = structuredClone(input);
  tampered.response.witness_receipt.unix_time_milliseconds++;
  const bad = await requestRpc(endpoint, send, 5, "tools/call", { name: "popcorn_verify_v2", arguments: tampered });
  assert.equal((bad.structuredContent as { accepted: boolean }).accepted, false);
  assert.equal(requests.length, 2);
});

test("dry run cannot forward payment; approval without caller signature cannot use server funds", async () => {
  let count = 0;
  const upstream = async (req: Request) => { count++; assert.equal(req.headers.get("payment-signature"), null); return challenge(); };
  const result = await requestReceipt(upstream, "/v2/receipt", { nonce: "test" }, { approve_payment: false });
  assert.equal(result.payment_sent, false);
  assert.equal(count, 1);
  await assert.rejects(requestReceipt(upstream, "/v2/receipt", {}, { approve_payment: false, payment_signature: proof }), /explicit approval/);
  await assert.rejects(requestReceipt(upstream, "/v2/receipt", {}, { approve_payment: true }), /own wallet/);
  assert.equal(count, 1);
});

test("approved caller proof is forwarded exactly once and settlement remains qualified", async () => {
  const requests: Request[] = [];
  const tx = "0x" + "a".repeat(64);
  const result = await requestReceipt(async req => {
    requests.push(req);
    if (requests.length === 1) return challenge();
    assert.equal(req.headers.get("payment-signature"), proof);
    return new Response(JSON.stringify({ witness_receipt: { payment_transaction: tx } }), { headers: { "payment-response": encode({ success: true, network: "eip155:8453", transaction: tx }) } });
  }, "/v2/receipt", { nonce: "public-test" }, { approve_payment: true, payment_signature: proof });
  assert.equal(requests.length, 2);
  assert.equal(result.settlement_reported_by_issuer, true);
  assert.equal(result.receipt_signature_checked_by_tool, false);
  assert.equal(result.on_chain_settlement_checked_by_tool, false);
  assert.equal(result.authorization_granted, false);
});

test("wrong recipient, amount, resource, and changed challenge fail before forwarding a proof", async () => {
  for (const changed of [{ ...option, amount: "1001" }, { ...option, payTo: "0x" + "0".repeat(40) }, { ...option, network: "eip155:1" }]) {
    let calls = 0;
    await assert.rejects(requestReceipt(async () => { calls++; return challenge(); }, "/v2/receipt", {}, { approve_payment: true, payment_signature: encode({ x402Version: 2, resource: terms.resource, accepted: changed, payload: {} }) }));
    assert.equal(calls, 0);
  }
  await assert.rejects(requestReceipt(async () => challenge(), "/v1/time?freshness_ms=30000", null, { approve_payment: true, payment_signature: proof }), /resource/);
  let calls = 0;
  await assert.rejects(requestReceipt(async req => { calls++; assert.equal(req.headers.get("payment-signature"), null); return challenge({ ...terms, accepts: [{ ...option, amount: "2000" }] }); }, "/v2/receipt", {}, { approve_payment: true, payment_signature: proof }));
  assert.equal(calls, 1);
});

test("timeout after proof submission is unknown and never automatically retried", async () => {
  let calls = 0;
  const result = await requestReceipt(async () => { if (++calls === 1) return challenge(); throw new Error("timeout"); }, "/v2/receipt", {}, { approve_payment: true, payment_signature: proof });
  assert.equal(calls, 2);
  assert.equal(result.settlement_status, "unknown");
  assert.equal(result.do_not_retry_automatically, true);
});

test("signed-payload amount, recipient, nonce, signature and validity are checked before forwarding", async () => {
  const variants = [
    { ...payload, authorization: { ...payload.authorization, value: "1000000" } },
    { ...payload, authorization: { ...payload.authorization, to: "0x" + "44".repeat(20) } },
    { ...payload, authorization: { ...payload.authorization, nonce: "0x00" } },
    { ...payload, authorization: { ...payload.authorization, validBefore: String(now + 10000) } },
    { ...payload, authorization: { ...payload.authorization, validBefore: String(now - 1) } },
    { ...payload, authorization: { ...payload.authorization, validAfter: String(now + 60) } },
    { ...payload, signature: "test-only" },
    { authorization: payload.authorization },
  ];
  for (const badPayload of variants) {
    let calls = 0;
    await assert.rejects(requestReceipt(async () => { calls++; return challenge(); }, "/v2/receipt", {}, {
      approve_payment: true, payment_signature: encode({ x402Version: 2, resource: terms.resource, accepted: option, payload: badPayload }),
    }), /authorization/);
    assert.equal(calls, 0, "invalid authorization must not reach the issuer");
  }
});

test("redirected keys fail closed; origin/body limits and route passthrough hold", async () => {
  let calls = 0;
  const env: Env = { POPCORN: { fetch: async req => { calls++; return req.url.endsWith("/mcp-old") ? new Response("unchanged") : new Response(null, { status: 302, headers: { location: "https://untrusted.example/keys" } }); } } };
  const result = await requestRpc(endpoint, req => worker.fetch(req, env), 1, "tools/call", { name: "popcorn_verify_v2", arguments: { response: fixture, jwks, expected_nonce: fixture.witness_receipt.commitment.nonce, expected_payload_digest: fixture.witness_receipt.commitment.payload_digest.value } });
  assert.equal(result.isError, true);
  assert.equal(calls, 1);
  assert.equal((await worker.fetch(new Request(endpoint, { headers: { origin: "https://untrusted.example" } }), env)).status, 403);
  assert.equal((await worker.fetch(new Request("https://attacker.example/mcp"), env)).status, 403);
  const oversized = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ padding: "x".repeat(131072) }) });
  assert.equal((await worker.fetch(oversized, env)).status, 413);
  assert.equal(await (await worker.fetch(new Request("https://767-2676.com/mcp-old"), env)).text(), "unchanged");
  assert.equal(calls, 2);
});
