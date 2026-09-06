import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Advertise an available package, even while main prepares a newer release.
const manifest = JSON.parse(await readFile(new URL("./server.json", import.meta.url), "utf8"));
assert.equal(manifest.name, "io.github.violetclaire/popcorn-mcp");
assert.equal(manifest.packages.length, 1);
const pkg = manifest.packages[0];
assert.equal(pkg.registryType, "npm");
assert.equal(pkg.registryBaseUrl, "https://registry.npmjs.org");
assert.equal(pkg.identifier, "@violetclaire/popcorn-mcp");
assert.equal(pkg.version, manifest.version);
assert.equal(pkg.transport.type, "stdio");
const url = new URL(
  encodeURIComponent(pkg.identifier) + "/" + encodeURIComponent(pkg.version),
  pkg.registryBaseUrl + "/",
);
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
assert.equal(response.status, 200, "the advertised npm version must exist before discovery publication");
const published = await response.json();
assert.equal(published.name, pkg.identifier);
assert.equal(published.version, pkg.version);
assert.equal(published.mcpName, manifest.name, "npm must verify ownership of this MCP namespace");
assert.ok(published.bin?.["popcorn-mcp"], "the published package must expose the MCP executable");
console.log("Validated public package and MCP namespace: " + pkg.identifier + "@" + pkg.version);
