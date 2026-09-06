import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Reproduce the installed file layout away from the repository and dependencies.
const isolated = await mkdtemp(join(tmpdir(), "popcorn-sample-"));
try {
  await cp(new URL("../dist/", import.meta.url), join(isolated, "dist"), { recursive: true });
  await cp(new URL("../package.json", import.meta.url), join(isolated, "package.json"));
  const environment = { ...process.env };
  delete environment.EVM_PRIVATE_KEY;
  delete environment.NODE_PATH;
  const run = spawnSync(process.execPath, [
    "--permission", `--allow-fs-read=${isolated}`,
    join(isolated, "dist/packages/mcp/src/index.js"), "--sample",
  ], { cwd: isolated, env: environment, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.payment_sent, false);
  assert.equal(output.evaluation_only, true);
  assert.deepEqual(output.examples.map((item) => item.historical_time_check.decision), [
    "STOP", "TIME_CHECK_PASSED",
  ]);
  for (const filename of [
    "evaluation-packet.production.json",
    "evaluation-packet.proceed-002.production.json",
  ]) {
    assert.deepEqual(
      await readFile(join(isolated, "dist/examples/witness", filename)),
      await readFile(new URL(`../../../examples/witness/${filename}`, import.meta.url)),
    );
  }
  process.stderr.write("isolated sample CLI passed without a wallet or runtime dependencies\n");
} finally {
  await rm(isolated, { recursive: true, force: true });
}
