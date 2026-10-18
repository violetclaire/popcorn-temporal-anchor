import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function publicationNeeded(manifest, fetcher = fetch) {
  const url = "https://registry.modelcontextprotocol.io/v0.1/servers/" +
    encodeURIComponent(manifest.name) + "/versions/" + encodeURIComponent(manifest.version);
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return true;
  assert.equal(response.status, 200, "registry lookup must succeed before publication");
  const record = await response.json();
  assert.equal(record._meta?.["io.modelcontextprotocol.registry/official"]?.status, "active",
    "existing registry version must be active");
  assert.deepEqual(record.server, manifest,
    "existing immutable version differs from server.json; prepare a new version instead");
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile(new URL("./server.json", import.meta.url), "utf8"));
  const needed = await publicationNeeded(manifest);
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(process.env.GITHUB_OUTPUT, "needed=" + needed + "\n");
  console.log(needed ? "Registry version is absent; publication is needed." :
    "Exact active registry version already exists; publication is complete.");
}
