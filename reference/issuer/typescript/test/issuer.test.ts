import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyPopcornWitnessEvidence } from "../../../../verify/typescript/src/index.js";
import {
  handlePaidWitnessRequest,
  issuePopcornWitnessReceipt,
  sha256Base64Url,
} from "../src/index.js";

test("issues a payload-bound receipt accepted by the offline verifier", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const keyId = "issuer-test-key";
  const payload = '{"checkpoint_id":"cp_test","state":"ready"}';
  const nonce = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
  const ticks = [
    Date.parse("2026-08-30T12:00:00.125Z"),
    Date.parse("2026-08-30T12:00:00.130Z"),
  ];

  const response = await issuePopcornWitnessReceipt(
    {
      payload_digest: {
        algorithm: "sha-256",
        value: await sha256Base64Url(payload),
      },
      nonce,
      previous_attestation_digest: null,
    },
    {
      receipt_id: "pwr_issuer_test",
      signing_key: pair.privateKey,
      signing_key_id: keyId,
      request_received_at_ms: Date.parse("2026-08-30T12:00:00.000Z"),
      clock_accuracy_radius_ms: 1000,
      payment_identifier: "payment_issuer_test",
      payment_transaction: null,
      now_ms: () => ticks.shift() as number,
    },
  );

  const verified = await verifyPopcornWitnessEvidence(
    response,
    {
      keys: [
        {
          ...publicJwk,
          use: "sig",
          alg: "ES256",
          kid: keyId,
        },
      ],
    },
    { expected_payload: payload, expected_nonce: nonce },
  );

  assert.equal(verified.signature_verified, true);
  assert.equal(verified.previous_attestation_digest_matched, false);
  assert.equal(
    verified.replay_key,
    `767-2676.com:pwr_issuer_test:${nonce}`,
  );
});

test("rejects unsupported request fields before signing", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  await assert.rejects(
    issuePopcornWitnessReceipt(
      {
        payload_digest: {
          algorithm: "sha-256",
          value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        },
        nonce: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        previous_attestation_digest: null,
        raw_payload: "must not be accepted",
      },
      {
        receipt_id: "pwr_rejected",
        signing_key: pair.privateKey,
        signing_key_id: "issuer-test-key",
        request_received_at_ms: 1,
        clock_accuracy_radius_ms: 1000,
        payment_identifier: "payment_rejected",
        payment_transaction: null,
        now_ms: () => 2,
      },
    ),
    /unsupported fields/,
  );
});

test("paid HTTP handler returns a verifiable no-store witness response", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const keyId = "issuer-http-test-key";
  const payload = '{"checkpoint_id":"cp_http","state":"ready"}';
  const nonce = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
  const ticks = [
    Date.parse("2026-08-30T12:00:00.125Z"),
    Date.parse("2026-08-30T12:00:00.130Z"),
  ];
  const request = new Request("https://767-2676.com/v1/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload_digest: {
        algorithm: "sha-256",
        value: await sha256Base64Url(payload),
      },
      nonce,
      previous_attestation_digest: null,
    }),
  });

  const httpResponse = await handlePaidWitnessRequest(request, {
    receipt_id: "pwr_http_test",
    signing_key: pair.privateKey,
    signing_key_id: keyId,
    request_received_at_ms: Date.parse("2026-08-30T12:00:00.000Z"),
    clock_accuracy_radius_ms: 1000,
    payment_identifier: "payment_http_test",
    payment_transaction: null,
    now_ms: () => ticks.shift() as number,
  });

  assert.equal(httpResponse.status, 200);
  assert.equal(httpResponse.headers.get("cache-control"), "no-store, private");
  assert.equal(
    httpResponse.headers.get("x-popcorn-protocol"),
    "POPCORN-WITNESS/1.0",
  );
  const body = await httpResponse.json();
  const verified = await verifyPopcornWitnessEvidence(
    body,
    {
      keys: [{ ...publicJwk, use: "sig", alg: "ES256", kid: keyId }],
    },
    { expected_payload: payload, expected_nonce: nonce },
  );
  assert.equal(verified.signature_verified, true);
});
