import assert from "node:assert/strict";
import { test } from "node:test";
import { popcornSample } from "../src/sample.js";

test("sample verifies both real receipts and tamper controls without network or payment", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("sample must not fetch"); });
  const result = await popcornSample();
  assert.equal(result.evaluation_only, true);
  assert.equal(result.payment_sent, false);
  assert.equal(result.network_request_made, false);
  assert.equal(result.authorization_granted, false);
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
