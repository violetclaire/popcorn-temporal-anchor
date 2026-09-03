import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  POPCORN_NETWORK,
  POPCORN_PAY_TO,
  POPCORN_PRICE_ATOMIC,
  POPCORN_USDC,
  popcornHash,
  popcornTime,
  popcornVerify,
  popcornWitness,
} from "../src/core.js";

function challenge(url: string) {
  return {
    x402Version: 2,
    error: "payment_proof_required",
    resource: { url, description: "test", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: POPCORN_NETWORK,
        amount: POPCORN_PRICE_ATOMIC,
        asset: POPCORN_USDC,
        payTo: POPCORN_PAY_TO,
        maxTimeoutSeconds: 60,
      },
    ],
  };
}

function challengeFetch(requests: Array<{ url: string; init?: RequestInit }>): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ url, ...(init === undefined ? {} : { init }) });
    const encoded = Buffer.from(JSON.stringify(challenge(url))).toString("base64url");
    return new Response(JSON.stringify({ error: "payment_proof_required" }), {
      status: 402,
      headers: {
        "content-type": "application/json",
        "payment-required": encoded,
      },
    });
  };
}

test("popcorn_hash hashes exact local bytes without a wallet", () => {
  const value = popcornHash({ payload_text: "hello" });
  assert.equal(value.byte_length, 5);
  assert.equal(
    value.digest.value,
    createHash("sha256").update("hello").digest("base64url"),
  );
  assert.equal(value.payment_sent, false);
});

test("popcorn_time defaults to one unpaid 402 dry run", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const result = await popcornTime({}, { fetch: challengeFetch(requests), env: {} });
  assert.equal(result.payment_sent, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.init?.method, "GET");
  assert.match(requests[0]?.url ?? "", /freshness_ms=30000$/);
});

test("popcorn_witness dry run returns the exact request and sends no payment", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const digest = Buffer.alloc(32, 0x11).toString("base64url");
  const nonce = Buffer.alloc(32, 0x22).toString("base64url");
  const result = await popcornWitness(
    { digest, nonce },
    { fetch: challengeFetch(requests), env: {} },
  );
  assert.equal(result.payment_sent, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(result.request.body_utf8 ?? "null"), {
    payload_digest: { algorithm: "sha-256", value: digest },
    nonce,
    previous_attestation_digest: null,
  });
});

test("approve_payment cannot spend without EVM_PRIVATE_KEY", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  await assert.rejects(
    popcornTime(
      { approve_payment: true },
      { fetch: challengeFetch(requests), env: {} },
    ),
    /EVM_PRIVATE_KEY/,
  );
  assert.equal(requests.length, 1);
  assert.equal(
    new Headers(requests[0]?.init?.headers).has("payment-signature"),
    false,
  );
});

test("popcorn_verify validates chained receipt 003 entirely offline", async () => {
  const vector = JSON.parse(
    await readFile(
      new URL(
        "../../../verify/test-vectors/popcorn-witness-chain-003.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const result = await popcornVerify({
    receipt_type: "witness",
    response: vector.current.paid_evidence,
    jwks: { keys: [vector.current.public_verification_key] },
    verification: {
      expected_nonce: vector.current.submitted_request.nonce,
      expected_payload_base64url: vector.current.exact_schedule.bytes,
      previous_receipt: {
        response: vector.predecessor.paid_evidence,
        jwks: { keys: [vector.predecessor.public_verification_key] },
        verification: {
          expected_nonce: vector.predecessor.submitted_request.nonce,
          expected_payload_base64url: vector.predecessor.exact_schedule.bytes,
        },
      },
    },
  });
  assert.equal(result.receipt_type, "witness");
  assert.equal(result.verified.previous_attestation_digest_matched, true);
});
