import assert from "node:assert/strict";
import test from "node:test";
import { publicationState } from "./publication-state.mjs";

const manifest = {
  name: "io.github.violetclaire/popcorn-mcp", version: "0.1.4", description: "Precise scope",
  repository: { source: "github", url: "https://github.com/violetclaire/popcorn-temporal-anchor", subfolder: "packages/mcp" },
  packages: [{ registryType: "npm", identifier: "@violetclaire/popcorn-mcp", version: "0.1.3", transport: { type: "stdio" }, environmentVariables: [{ name: "EVM_PRIVATE_KEY", isRequired: false, isSecret: true }] }],
};
const published = (server = structuredClone(manifest)) => ({ server, _meta: { "io.modelcontextprotocol.registry/official": { status: "active" } } });

test("metadata version is independent of the installed package version", () => {
  assert.equal(publicationState(manifest, null, published({ ...manifest, version: "0.1.3" })).publish, true);
});

test("an existing active version is skipped without republishing", () => {
  const exact = published();
  delete exact.server.packages[0].environmentVariables[0].isRequired;
  assert.deepEqual(publicationState(manifest, exact, exact), {
    publish: false, reason: "version_already_published", metadata_differs: false,
  });
});

test("descriptive drift is disclosed without overwriting the existing version", () => {
  const exact = published({ ...manifest, description: "Previously published copy" });
  assert.deepEqual(publicationState(manifest, exact, exact), {
    publish: false, reason: "version_already_published", metadata_differs: true,
  });
});

test("reusing an existing version for a changed package fails closed", () => {
  const exact = published();
  exact.server.packages[0].version = "0.1.2";
  assert.throws(() => publicationState(manifest, exact, exact), /different packages/);
});

test("a lower unpublished version cannot downgrade registry latest", () => {
  assert.throws(() => publicationState(manifest, null, published({ ...manifest, version: "0.1.5" })), /refusing a downgrade/);
});

test("deprecated or deleted versions cannot be silently reused", () => {
  const exact = published();
  exact._meta["io.modelcontextprotocol.registry/official"].status = "deprecated";
  assert.throws(() => publicationState(manifest, exact, exact), /not active/);
});

test("registry errors cannot be mistaken for another namespace", () => {
  assert.throws(() => publicationState(manifest, null, published({ ...manifest, name: "other/server" })), /name differs/);
});
