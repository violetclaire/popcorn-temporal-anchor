import { readFile, readdir } from "node:fs/promises";

type Vector = {
  test_only: true;
  id: string;
  category: string;
  expected: { accepted: boolean; reason: string };
  input: Record<string, unknown>;
};

type RpcReply = {
  jsonrpc: "2.0";
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

export type HttpSmokeReport = {
  protocol_id: "POPCORN-WITNESS/2.0";
  test_only: true;
  transport: "Streamable HTTP";
  initialized: boolean;
  tools: string[];
  cases: Array<{
    id: string;
    category: string;
    expected: Vector["expected"];
    http: { accepted: boolean; reason: string };
    difference: boolean;
  }>;
  passed: boolean;
};

const vectorDir = new URL("../../../verify/test-vectors/interface-parity-v2/", import.meta.url);

async function requestRpc(
  endpoint: string,
  send: (request: Request) => Promise<Response>,
  id: number,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await send(new Request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }));
  if (response.status !== 200) throw new Error(`${method}: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  let reply: RpcReply;
  if (contentType.includes("text/event-stream")) {
    const messages = body.split(/\r?\n/).filter(line => line.startsWith("data: "));
    if (messages.length !== 1) throw new Error(`${method}: expected one SSE message`);
    reply = JSON.parse(messages[0].slice(6)) as RpcReply;
  } else if (contentType.includes("application/json")) {
    reply = JSON.parse(body) as RpcReply;
  } else {
    throw new Error(`${method}: unexpected content type ${contentType}`);
  }
  if (reply.id !== id || reply.jsonrpc !== "2.0") throw new Error(`${method}: JSON-RPC envelope mismatch`);
  if (reply.error) throw new Error(`${method}: ${reply.error.message ?? "JSON-RPC error"}`);
  if (!reply.result) throw new Error(`${method}: missing result`);
  return reply.result;
}

/** Test the real HTTP handler with the same fixture files used by CLI and stdio MCP. */
export async function runHttpSmoke(
  endpoint: string,
  send: (request: Request) => Promise<Response>,
): Promise<HttpSmokeReport> {
  const initialized = await requestRpc(endpoint, send, 1, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "tain-http-smoke", version: "1.0.0" },
  });
  const serverInfo = initialized.serverInfo as { name?: string } | undefined;
  if (typeof serverInfo?.name !== "string") throw new Error("MCP initialization missing serverInfo");
  const listed = await requestRpc(endpoint, send, 2, "tools/list", {});
  const tools = (listed.tools as Array<{ name: string }> | undefined)?.map(tool => tool.name);
  if (!tools || tools.length !== 1 || tools[0] !== "popcorn_verify_v2") {
    throw new Error(`Remote tool surface differs: ${JSON.stringify(tools)}`);
  }
  const files = (await readdir(vectorDir)).filter(name => name.endsWith(".json")).sort();
  if (files.length !== 6) throw new Error(`Expected six fixed vectors; found ${files.length}`);
  const cases: HttpSmokeReport["cases"] = [];
  for (const [index, file] of files.entries()) {
    const vector = JSON.parse(await readFile(new URL(file, vectorDir), "utf8")) as Vector;
    if (vector.test_only !== true) throw new Error(`${file}: not marked test_only`);
    const called = await requestRpc(endpoint, send, index + 3, "tools/call", {
      name: "popcorn_verify_v2",
      arguments: vector.input,
    });
    const outcome = called.structuredContent as { accepted?: boolean; reason?: string } | undefined;
    if (typeof outcome?.accepted !== "boolean" || typeof outcome.reason !== "string") {
      throw new Error(`${file}: missing structured verifier result`);
    }
    const http = { accepted: outcome.accepted, reason: outcome.reason };
    cases.push({
      id: vector.id,
      category: vector.category,
      expected: vector.expected,
      http,
      difference: JSON.stringify(http) !== JSON.stringify(vector.expected),
    });
  }
  return {
    protocol_id: "POPCORN-WITNESS/2.0",
    test_only: true,
    transport: "Streamable HTTP",
    initialized: true,
    tools,
    cases,
    passed: cases.every(item => !item.difference),
  };
}
