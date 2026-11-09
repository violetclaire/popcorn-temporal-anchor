import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import * as core from "@violetclaire/popcorn-mcp/core";
import {
  createPopcornClient, createPopcornPlugin, parsePopcornCommand,
  type PaymentQuote, type PopcornClient, type PopcornClientOptions,
  type VerifyInput, type WitnessInput,
} from "../src/index.js";

const digest = Buffer.alloc(32, 1).toString("base64url");
const nonce = Buffer.alloc(32, 2).toString("base64url");
const witness = { digest, nonce };
const terms = {
  x402Version: 2,
  resource: { url: core.POPCORN_WITNESS_URL },
  accepts: [{
    scheme: "exact", network: core.POPCORN_NETWORK,
    amount: core.POPCORN_PRICE_ATOMIC, asset: core.POPCORN_USDC,
    payTo: core.POPCORN_PAY_TO,
  }],
};

function quote(input: WitnessInput): PaymentQuote {
  return {
    payment_sent: false,
    request: {
      method: "POST", url: core.POPCORN_WITNESS_URL,
      headers: { "Content-Type": "application/json" },
      body_utf8: JSON.stringify(input),
    },
    challenge: {
      status: 402, payment_required: Buffer.from(JSON.stringify(terms)).toString("base64"),
      decoded_terms: terms, response_body: { error: "payment_required" },
    },
  };
}

function fakeClient(options: PopcornClientOptions = {}) {
  const calls: Array<Parameters<typeof core.popcornWitness>[0]> = [];
  const popcornWitness = (async (input: Parameters<typeof core.popcornWitness>[0]) => {
    calls.push(structuredClone(input));
    if (!input.approve_payment) return quote(input);
    return {
      payment_sent: true, request: quote(input).request,
      settlement_tx_hash: "mock-no-transaction", server_processing_duration_ms: 1,
      payment_response: "mock", payment_response_decoded: {},
      response: { witness_receipt: { protocol_id: "POPCORN-WITNESS/2.0" } },
    };
  }) as typeof core.popcornWitness;
  return { calls, client: createPopcornClient(options, { ...core, popcornWitness }) };
}

const runtime = {} as IAgentRuntime;
const message = (text: string) => ({ content: { text } }) as Memory;
async function run(name: string, text: string, options: Parameters<typeof createPopcornPlugin>[0] = {}) {
  const plugin = createPopcornPlugin(options);
  const action = plugin.actions!.find((entry) => entry.name === name)!;
  return action.handler(runtime, message(text));
}

test("exports genuine stable ElizaOS actions and no paid action", () => {
  const plugin = createPopcornPlugin();
  assert.equal(plugin.name, "popcorn");
  assert.deepEqual(plugin.actions!.map((action) => action.name), [
    "POPCORN_SAMPLE", "POPCORN_HANDOFF", "POPCORN_CATALOG", "POPCORN_HASH", "POPCORN_VERIFY", "POPCORN_WITNESS",
  ]);
});

test("default parser preserves exact JSON string bytes and rejects prose/wrappers", () => {
  const payload = "Hello\nBriarwood ☕\n";
  assert.deepEqual(parsePopcornCommand("POPCORN_HASH", `POPCORN_HASH\t${JSON.stringify({ payload_text: payload })}`), { payload_text: payload });
  for (const value of [
    `Please POPCORN_HASH {"payload_text":"a"}`, "```POPCORN_HASH {} ```",
    "POPCORN_HASH {} {}", "POPCORN_HASH []", "POPCORN_HASHING {}", "POPCORN_VERIFY {}",
  ]) assert.throws(() => parsePopcornCommand("POPCORN_HASH", value));
});

test("hash action uses exact payload and does not need a wallet or network", async () => {
  const value = "Briarwood\r\n";
  const result = await run("POPCORN_HASH", `POPCORN_HASH ${JSON.stringify({ payload_text: value })}`);
  assert.equal(result!.success, true);
  const output = result!.data!.result as ReturnType<typeof core.popcornHash>;
  assert.equal(output.digest.value, createHash("sha256").update(value).digest("base64url"));
  assert.equal(output.byte_length, Buffer.byteLength(value));
  assert.equal(result!.data!.payment_sent, false);
});

test("hash action rejects extra approval fields and invalid payload types", async () => {
  for (const input of [{ payload_text: "a", approve_payment: true }, { payload_text: 4 }, { payload_text: "a", payload_base64url: "YQ" }]) {
    const result = await run("POPCORN_HASH", `POPCORN_HASH ${JSON.stringify(input)}`);
    assert.equal(result!.success, false);
  }
});

test("verification action requires host-selected keys and rejects command keys", async () => {
  const input = { receipt_type: "witness", response: {}, verification: {} };
  const missing = await run("POPCORN_VERIFY", `POPCORN_VERIFY ${JSON.stringify(input)}`);
  assert.equal(missing!.success, false);
  assert.match(String(missing!.error), /host must configure/);
  const injected = await run("POPCORN_VERIFY", `POPCORN_VERIFY ${JSON.stringify({ ...input, jwks: { keys: [] } })}`, { trustedJwks: { keys: [] } });
  assert.equal(injected!.success, false);
  assert.match(String(injected!.error), /unsupported input fields/);
});

test("verification binds independently configured keys through predecessor chain", async () => {
  const trustedJwks = { keys: [{ kid: "trusted" }] };
  let received: VerifyInput | undefined;
  const client = {
    ...createPopcornClient(),
    verify: async (input: VerifyInput) => { received = input; return { receipt_type: "witness", verified: {} }; },
  } as PopcornClient;
  const input = {
    receipt_type: "witness", response: { witness_receipt: { protocol_id: "POPCORN-WITNESS/2.0" } },
    verification: {
      expected_nonce: nonce, expected_payload_digest: digest,
      previous_receipt: { response: {}, verification: { expected_nonce: nonce, expected_payload_digest: digest } },
    },
  };
  const result = await run("POPCORN_VERIFY", `POPCORN_VERIFY ${JSON.stringify(input)}`, { trustedJwks, client });
  assert.equal(result!.success, true);
  assert.deepEqual(received!.jwks, trustedJwks);
  assert.deepEqual((received!.verification.previous_receipt as { jwks: unknown }).jwks, trustedJwks);
  assert.equal(result!.data!.authorization_granted, false);
});

test("host input resolver receives action/context and does not require command syntax", async () => {
  let operation: string | undefined;
  const result = await run("POPCORN_HASH", "application data", {
    resolveInput: (name, context) => { operation = name; assert.equal(context.message.content.text, "application data"); return { payload_text: "exact host data" }; },
  });
  assert.equal(operation, "POPCORN_HASH");
  assert.equal(result!.success, true);
});

test("quote sends one unpaid request to /v2/receipt even when a payer key is set", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ error: "payment_required" }), {
      status: 402, headers: { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(terms)).toString("base64") },
    });
  }) as typeof fetch;
  const client = createPopcornClient({ fetch: fetchMock, env: { EVM_PRIVATE_KEY: `0x${"01".repeat(32)}` } });
  const result = await client.quoteWitness(witness);
  assert.equal(result.payment_sent, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://767-2676.com/v2/receipt");
  assert.equal(new Headers(calls[0].init!.headers).has("payment-signature"), false);
  assert.deepEqual(JSON.parse(calls[0].init!.body as string), {
    payload_digest: { algorithm: "sha-256", value: digest }, nonce, previous_attestation_digest: null,
  });
});

test("model-visible witness action cannot request payment", async () => {
  const { client, calls } = fakeClient({ authorizePayment: async (request) => ({ approved: true, request_id: request.request_id }) });
  const injected = await run("POPCORN_WITNESS", `POPCORN_WITNESS ${JSON.stringify({ ...witness, approve_payment: true })}`, { client });
  assert.equal(injected!.success, false);
  assert.equal(calls.length, 0);
  const result = await run("POPCORN_WITNESS", `POPCORN_WITNESS ${JSON.stringify(witness)}`, { client });
  assert.equal(result!.success, true);
  assert.deepEqual(calls.map((input) => input.approve_payment), [false]);
});

test("host witness defaults to quote when approval callback is absent", async () => {
  const { client, calls } = fakeClient();
  const result = await client.requestWitness(witness);
  assert.equal(result.payment_sent, false);
  assert.deepEqual(calls.map((input) => input.approve_payment), [false]);
});

test("denied or mismatched approval cannot send payment", async () => {
  for (const authorizePayment of [
    async () => ({ approved: false as const }),
    async () => ({ approved: true as const, request_id: "another-request" }),
  ]) {
    const { client, calls } = fakeClient({ authorizePayment });
    assert.equal((await client.requestWitness(witness)).payment_sent, false);
    assert.deepEqual(calls.map((input) => input.approve_payment), [false]);
  }
});

test("callback approval binds one immutable input, quote and request id", async () => {
  const mutableInput = { ...witness };
  let savedRequestId: string | undefined;
  const { client, calls } = fakeClient({
    authorizePayment: async (request) => {
      assert.ok(Object.isFrozen(request));
      assert.ok(Object.isFrozen(request.input));
      assert.ok(Object.isFrozen(request.quote.challenge.decoded_terms));
      assert.equal(request.payment.amount_atomic, "1000");
      assert.equal(request.quote.request.url, "https://767-2676.com/v2/receipt");
      mutableInput.nonce = Buffer.alloc(32, 3).toString("base64url");
      savedRequestId ??= request.request_id;
      return { approved: true, request_id: savedRequestId };
    },
  });
  assert.equal((await client.requestWitness(mutableInput)).payment_sent, true);
  assert.deepEqual(calls[1], { ...witness, approve_payment: true });
  assert.equal((await client.requestWitness(witness)).payment_sent, false);
  assert.deepEqual(calls.map((input) => input.approve_payment), [false, true, false]);
});

test("approval callback errors never send payment", async () => {
  const { client, calls } = fakeClient({ authorizePayment: async () => { throw new Error("approval unavailable"); } });
  await assert.rejects(client.requestWitness(witness), /approval unavailable/);
  assert.deepEqual(calls.map((input) => input.approve_payment), [false]);
});

test("host API rejects approve_payment smuggled into runtime input", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(client.requestWitness({ ...witness, approve_payment: true } as WitnessInput), /payment approval is a host operation/);
  assert.equal(calls.length, 0);
});

test("bundled sample works without network, payment or runtime services", async () => {
  const result = await run("POPCORN_SAMPLE", "show sample");
  assert.equal(result!.success, true);
  const sample = result!.data!.result as Record<string, unknown>;
  assert.equal(sample.payment_sent, false);
  assert.equal(sample.network_request_made, false);
  assert.equal(sample.authorization_granted, false);
  const v2 = sample.v2 as Record<string, unknown>;
  assert.equal(v2.accepted, true);
  assert.equal(v2.one_byte_tamper_rejected, true);
  assert.equal(v2.altered_signature_rejected, true);
});

test("handoff returns a portable verified historical packet without sending it", async () => {
  const result = await run("POPCORN_HANDOFF", "prepare an evidence packet");
  assert.equal(result!.success, true);
  const packet = result!.data!.result as Record<string, unknown>;
  assert.equal(packet.payment_sent, false);
  assert.equal(packet.authorization_granted, false);
  assert.equal(packet.historical, true);
  assert.ok(packet.input);
  assert.equal(packet.reproduce, "popcorn-mcp verify-v2 handoff.json");
});
