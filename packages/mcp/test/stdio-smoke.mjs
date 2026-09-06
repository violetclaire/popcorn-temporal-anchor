import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const serverPath = new URL(
  "../dist/packages/mcp/src/index.js",
  import.meta.url,
).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  stderr: "pipe",
});
const client = new Client({ name: "popcorn-stdio-smoke", version: "0.1.0" });
let serverErrors = "";
transport.stderr?.on("data", (chunk) => { serverErrors += chunk.toString(); });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 6);
  const response = await client.callTool({
    name: "popcorn_hash",
    arguments: { payload_text: "stdio" },
  });
  assert.equal(
    response.structuredContent?.byte_length,
    5,
  );
  const sample = await client.callTool({ name: "popcorn_sample", arguments: {} });
  assert.equal(sample.isError, undefined);
  assert.deepEqual(
    sample.structuredContent?.examples.map((entry) => entry.historical_time_check.decision),
    ["STOP", "TIME_CHECK_PASSED"],
  );
  process.stderr.write("stdio smoke test passed\n");
} catch (error) {
  if (serverErrors) process.stderr.write(serverErrors);
  throw error;
} finally {
  await client.close();
}
