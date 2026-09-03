import assert from "node:assert/strict";
import { test } from "node:test";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { createServer } from "../src/server.js";

test("MCP client lists all five tools and calls the local hash tool", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "popcorn-test-client", version: "0.1.0" });
  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      [
        "popcorn_catalog",
        "popcorn_hash",
        "popcorn_time",
        "popcorn_verify",
        "popcorn_witness",
      ],
    );
    const called = await client.callTool({
      name: "popcorn_hash",
      arguments: { payload_text: "hello" },
    });
    assert.equal(called.isError, undefined);
    assert.equal(
      (called.structuredContent as { byte_length?: number } | undefined)
        ?.byte_length,
      5,
    );
  } finally {
    await client.close();
    await server.close();
  }
});
