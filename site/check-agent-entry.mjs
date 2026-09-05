#!/usr/bin/env node
import { handleAgentEntry } from "./generated/agent-entry.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--origin") {
  console.error("Usage: node site/check-agent-entry.mjs --origin https://767-2676.com");
  process.exit(2);
}
const origin = new URL(args[1]);
if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
  || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) {
  throw new Error("Use an HTTPS origin, or an HTTP loopback origin for a local check.");
}
const paths = ["/agents", "/demo", "/demo/", "/demo/demo.js", "/demo/styles.css", "/SKILL.md", "/llms.txt", "/docs/temporal-usage.md", "/sitemap.xml", "/samples/evaluation-packet.production.json", "/samples/evaluation-packet.proceed-002.production.json", "/samples/evaluation-outcomes.json", "/.well-known/agent.json", "/.well-known/popcorn-keys.json", "/openapi.json", "/v1/time"];
const results = await Promise.all(paths.map(async path => {
  try {
    const request = new Request(new URL(path, origin));
    const response = await fetch(request, { redirect: "error", signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    const expected = handleAgentEntry(request);
    if (path === "/v1/time") {
      const challenge = JSON.parse(body);
      const terms = challenge.accepts?.some(t => t.scheme === "exact" && t.network === "eip155:8453"
        && t.amount === "1000" && t.asset?.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
      if (response.status !== 402 || challenge.x402Version !== 2 || !terms || !response.headers.has("payment-required")
        || challenge.resource?.url !== "https://767-2676.com/v1/time") throw new Error("Unexpected unpaid time challenge");
    } else {
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (expected && body !== await expected.text()) throw new Error("Served bytes differ from the prepared release");
      if (!expected) {
        const parsed = JSON.parse(body);
        if (path.endsWith("agent.json") && parsed.node_id !== "767-2676.com") throw new Error("Unexpected manifest identity");
        if (path.endsWith("popcorn-keys.json") && !parsed.keys?.length) throw new Error("No verification keys");
        if (path === "/openapi.json" && (!parsed.paths?.["/v1/time"] || !parsed.paths?.["/v1/receipt"])) throw new Error("Missing service contracts");
      }
    }
    return { path, status: response.status, passed: true };
  } catch (error) {
    return { path, passed: false, error: error.message };
  }
}));
console.log(JSON.stringify({ origin: origin.origin, payments_made: 0, results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
