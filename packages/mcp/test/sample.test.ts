import assert from "node:assert/strict";
import { test } from "node:test";
import { popcornSample, popcornHandoff } from "../src/sample.js";
import { verifyV2 } from "../src/v2-interface.js";

test("sample verifies both real receipts and tamper controls without network or payment", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("sample must not fetch"); });
  const result = await popcornSample();
  assert.equal(result.evaluation_only, true);
  assert.equal(result.payment_sent, false);
  assert.equal(result.network_request_made, false);
  assert.equal(result.authorization_granted, false);
  assert.equal(result.v2.accepted, true);
  assert.equal(result.v2.protocol_id, "POPCORN-WITNESS/2.0");
  assert.equal(result.v2.receipt_id, "pwr_eb7e440aaff765e9d803c42d96c171c6");
  assert.equal(result.v2.byte_length, 385);
  assert.equal(result.v2.payload_digest, "A-7NHtiGbYFuGDg0-_f5RUPsyhjQoa3A87eYJS5gWKI");
  assert.equal(result.v2.one_byte_tamper_rejected, true);
  assert.equal(result.v2.altered_signature_rejected, true);
  assert.equal(result.v2.authorization_granted, false);
  assert.equal(result.v2.establishes_current_time, false);
  assert.equal(result.v2.issuer_key_trust_checked_by_tool, false);
  assert.equal(result.v2.on_chain_settlement_checked_by_tool, false);
  assert.deepEqual(result.examples.map((entry) => entry.historical_time_check.decision), [
    "STOP", "TIME_CHECK_PASSED",
  ]);
  for (const entry of result.examples) {
    assert.equal(entry.byte_length, 228);
    assert.equal(entry.signature_verified, true);
    assert.equal(entry.payload_digest_verified, true);
    assert.equal(entry.nonce_verified, true);
    assert.equal(entry.one_byte_tamper_rejected, true);
    assert.equal(entry.historical_time_check.authorization_granted, false);
  }
});

test("handoff can be independently verified and rejects changed exact bytes", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("handoff must not fetch"); });
  const packet = await popcornHandoff();
  assert.equal(packet.payment_sent, false);
  assert.equal(packet.authorization_granted, false);
  assert.equal((await verifyV2(packet.input)).accepted, true);
  const tampered = Buffer.from(packet.input.expected_payload_base64url, "base64url");
  tampered[0] ^= 1;
  assert.equal((await verifyV2({ ...packet.input, expected_payload_base64url: tampered.toString("base64url") })).accepted, false);
});
