import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../src/server.js";
import type { VerifyV2Outcome } from "../src/v2-interface.js";

type Packet = {
  test_only: true;
  id: string;
  category: string;
  expected: { accepted: boolean; reason: string };
  input: Record<string, unknown>;
};

const vectorDir = new URL("../../../verify/test-vectors/interface-parity-v2/", import.meta.url);
const reportUrl = new URL("../test-results/v2-parity-report.json", import.meta.url);
const cliPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

test("TAIN 2.0 CLI and local MCP tool accept and reject the same fixed vectors", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "tain-parity-gate", version: "1.0.0" });
  const rows: Array<Record<string, unknown>> = [];
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const names = (await client.listTools()).tools.map(tool => tool.name);
    assert.ok(names.includes("popcorn_verify_v2"), "local MCP interface is not advertised");
    const files = (await readdir(vectorDir)).filter(name => name.endsWith(".json")).sort();
    assert.equal(files.length, 6, "all six fixed conformance vectors must be present");
    for (const file of files) {
      const url = new URL(file, vectorDir);
      const packet = JSON.parse(await readFile(url, "utf8")) as Packet;
      assert.equal(packet.test_only, true);
      const cli = spawnSync(process.execPath, [
        "--import", "tsx", cliPath, "verify-v2", fileURLToPath(url),
      ], { encoding: "utf8", timeout: 30000 });
      let cliOutcome: VerifyV2Outcome | null = null;
      try { cliOutcome = JSON.parse(cli.stdout) as VerifyV2Outcome; } catch { /* recorded below */ }
      const mcp = await client.callTool({ name: "popcorn_verify_v2", arguments: packet.input });
      const mcpOutcome = mcp.structuredContent as VerifyV2Outcome | undefined;
      const cliResult = cliOutcome && { accepted: cliOutcome.accepted, reason: cliOutcome.reason };
      const mcpResult = mcpOutcome && { accepted: mcpOutcome.accepted, reason: mcpOutcome.reason };
      const difference = JSON.stringify(cliResult) !== JSON.stringify(mcpResult);
      const expectedMatch = JSON.stringify(cliResult) === JSON.stringify(packet.expected)
        && JSON.stringify(mcpResult) === JSON.stringify(packet.expected);
      const exitMatch = cli.status === (packet.expected.accepted ? 0 : 2);
      rows.push({
        id: packet.id, category: packet.category, expected: packet.expected,
        cli: cliResult ?? { error: cli.stderr, exit_status: cli.status },
        mcp: mcpResult ?? { error: mcp.content },
        cli_exit_status: cli.status, difference, expected_match: expectedMatch,
        exit_match: exitMatch,
      });
    }
    await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
    await writeFile(reportUrl, `${JSON.stringify({
      protocol_id: "POPCORN-WITNESS/2.0",
      test_only: true,
      source: "fixed synthetic conformance vectors; not chain settlement evidence",
      interfaces: ["local CLI verify-v2", "local MCP popcorn_verify_v2"],
      remote_mcp_connected: false,
      cases: rows,
      passed: rows.every(row => !row.difference && row.expected_match && row.exit_match),
    }, null, 2)}\n`);
    for (const row of rows) {
      assert.equal(row.difference, false, `${row.id}: interfaces differ`);
      assert.equal(row.expected_match, true, `${row.id}: expected accept/reject reason differs`);
      assert.equal(row.exit_match, true, `${row.id}: CLI exit status differs`);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
