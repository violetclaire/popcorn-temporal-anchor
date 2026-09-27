import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import worker from "../remote/worker.js";
import { runHttpSmoke } from "../remote/http-smoke.js";
import { remoteVerifyV2Schema } from "../src/v2-schema.js";

test("read-only remote Worker initializes, lists one tool, and matches all TAIN 2.0 vectors", async () => {
  const endpoint = "https://mcp.local.test/mcp";
  const report = await runHttpSmoke(endpoint, request => Promise.resolve(worker.fetch(request)));
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
  await writeFile(new URL("../test-results/remote-http-report.json", import.meta.url),
    `${JSON.stringify({ ...report, remote_mcp_connected: false }, null, 2)}\n`);
  assert.equal(report.passed, true, "remote HTTP vector results differ from fixed expectations");
  assert.deepEqual(report.tools, ["popcorn_verify_v2"]);
  const unrelated = await worker.fetch(new Request("https://mcp.local.test/v1/receipt"));
  assert.equal(unrelated.status, 404, "this Worker must not shadow POPCORN routes");
});

test("remote tool schema excludes payload bytes at the root and every predecessor", () => {
  const checks = { expected_nonce: "n", expected_payload_digest: "A".repeat(43) };
  const base = { response: {}, jwks: {}, ...checks };
  assert.equal(remoteVerifyV2Schema.safeParse({ ...base, expected_payload_base64url: "c2VjcmV0" }).success, false);
  assert.equal(remoteVerifyV2Schema.safeParse({
    ...base,
    previous_receipt: {
      response: {}, jwks: {},
      verification: { ...checks, expected_payload_base64url: "c2VjcmV0" },
    },
  }).success, false);
  assert.equal(remoteVerifyV2Schema.safeParse({
    ...base,
    previous_receipt: {
      response: {}, jwks: {},
      verification: {
        ...checks,
        previous_receipt: {
          response: {}, jwks: {},
          verification: { ...checks, expected_payload_base64url: "c2VjcmV0" },
        },
      },
    },
  }).success, false);
  let cursor: Record<string, unknown> = { ...base };
  const tooDeep = cursor;
  for (let link = 0; link < 9; link++) {
    const verification: Record<string, unknown> = { ...checks };
    cursor.previous_receipt = { response: {}, jwks: {}, verification };
    cursor = verification;
  }
  assert.equal(remoteVerifyV2Schema.safeParse(tooDeep).success, false);
});
