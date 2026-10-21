import assert from "node:assert/strict";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .filter((key) => !(key === "isRequired" && value[key] === false))
      .map((key) => [key, normalize(value[key])]));
  }
  return value;
}

function stableVersion(version) {
  assert.match(version, /^\d+\.\d+\.\d+$/, "use an explicit stable metadata version");
  return version.split(".").map(Number);
}

function isNewer(candidate, latest) {
  const a = stableVersion(candidate);
  const b = stableVersion(latest);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function publicationState(manifest, exact, latest) {
  stableVersion(manifest.version);
  if (exact) {
    assert.equal(exact.server.name, manifest.name, "existing registry name differs");
    assert.equal(exact.server.version, manifest.version, "existing registry version differs");
    const state = exact._meta?.["io.modelcontextprotocol.registry/official"]?.status;
    assert.equal(state, "active", "existing version is not active; review its lifecycle before publishing");
    // Never overwrite or silently reuse a version for different installation targets.
    for (const key of ["packages", "remotes", "repository"]) {
      assert.deepEqual(normalize(exact.server[key]), normalize(manifest[key]),
        `existing version has different ${key}; review and use a new metadata version`);
    }
    return {
      publish: false,
      reason: "version_already_published",
      metadata_differs: JSON.stringify(normalize(exact.server)) !== JSON.stringify(normalize(manifest)),
    };
  }
  if (latest) {
    assert.equal(latest.server.name, manifest.name, "latest registry name differs");
    assert.ok(isNewer(manifest.version, latest.server.version),
      "unpublished metadata version must be newer than the registry latest; refusing a downgrade");
  }
  return { publish: true, reason: "new_metadata_version", metadata_differs: false };
}
