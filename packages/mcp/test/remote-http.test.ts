import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import worker from "../remote/worker.js";
import { runHttpSmoke } from "../remote/http-smoke.js";

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
