import { runHttpSmoke } from "./http-smoke.js";

const endpoint = process.env.MCP_URL;
if (!endpoint || new URL(endpoint).protocol !== "https:" || new URL(endpoint).pathname !== "/mcp") {
  throw new Error("Set MCP_URL to the deployed HTTPS /mcp endpoint");
}
const report = await runHttpSmoke(endpoint, fetch);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
