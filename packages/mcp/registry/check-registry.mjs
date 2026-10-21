import { appendFile, readFile } from "node:fs/promises";
import { publicationState } from "./publication-state.mjs";

const manifest = JSON.parse(await readFile(new URL("./server.json", import.meta.url), "utf8"));
const base = "https://registry.modelcontextprotocol.io/v0.1/servers/";
const prefix = base + encodeURIComponent(manifest.name) + "/versions/";

async function readVersion(version) {
  const response = await fetch(prefix + encodeURIComponent(version), {
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`registry lookup failed: HTTP ${response.status}`);
  return response.json();
}

const [exact, latest] = await Promise.all([readVersion(manifest.version), readVersion("latest")]);
const result = publicationState(manifest, exact, latest);
console.log(JSON.stringify({ name: manifest.name, version: manifest.version, ...result }));
if (result.metadata_differs) {
  console.warn("Published installation targets match. Descriptive metadata differs; this run will not overwrite or republish the existing version. Use a new metadata version for a deliberate future update.");
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `publish=${result.publish}\n`);
}
