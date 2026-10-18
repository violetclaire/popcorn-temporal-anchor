import { readFile } from "node:fs/promises";
import { requestRpc } from "./http-smoke.js";

const endpoint = process.env.MCP_URL;
if (!endpoint || new URL(endpoint).protocol !== "https:" || new URL(endpoint).pathname !== "/mcp") {
  throw new Error("Set MCP_URL to the deployed HTTPS /mcp endpoint");
}

const receipt = JSON.parse(await readFile(new URL("./fixtures/popcorn-receipt.json", import.meta.url), "utf8"));
const expectedDigest = "A-7NHtiGbYFuGDg0-_f5RUPsyhjQoa3A87eYJS5gWKI";
const expectedNonce = "WRfPcCqfujj3OOXHMoirn9VKbfhNf99gNeTHGXQ1SII";
if (receipt.witness_receipt?.receipt_id !== "pwr_eb7e440aaff765e9d803c42d96c171c6" ||
    receipt.witness_receipt?.tain !== "tain_01M4YBT3FSPW08EWE0MGPN2WCT" ||
    receipt.witness_receipt?.commitment?.payload_digest?.value !== expectedDigest ||
    receipt.witness_receipt?.commitment?.nonce !== expectedNonce) {
  throw new Error("Live smoke fixture identity or commitment mismatch");
}
const clone = () => structuredClone(receipt);
const signatureChanged = clone();
const parts = signatureChanged.witness_attestation.compact_jws.split(".");
const sig = parts[2];
parts[2] = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
signatureChanged.witness_attestation.compact_jws = parts.join(".");
const noAttestation = clone();
delete noAttestation.witness_attestation;
const changedSigned = clone();
changedSigned.witness_receipt.commitment.nonce = "A".repeat(43);

const vectors = [
  { id: "production-issued-positive", response: clone(), digest: expectedDigest, nonce: expectedNonce, accepted: true, reason: /signature, digest, time interval, and required fields verified/ },
  { id: "altered-expected-digest", response: clone(), digest: "A".repeat(43), nonce: expectedNonce, accepted: false, reason: /receipt payload digest does not match/ },
  { id: "altered-expected-nonce", response: clone(), digest: expectedDigest, nonce: "A".repeat(43), accepted: false, reason: /receipt nonce does not match/ },
  { id: "altered-signature", response: signatureChanged, digest: expectedDigest, nonce: expectedNonce, accepted: false, reason: /signature is invalid/ },
  { id: "missing-witness-attestation", response: noAttestation, digest: expectedDigest, nonce: expectedNonce, accepted: false, reason: /missing witness_attestation/ },
  { id: "altered-signed-receipt", response: changedSigned, digest: expectedDigest, nonce: expectedNonce, accepted: false, reason: /does not equal the signed payload/ },
];

await requestRpc(endpoint, fetch, 1, "initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "tain-production-live-smoke", version: "1.0.0" },
});
const listed = await requestRpc(endpoint, fetch, 2, "tools/list", {});
if (!(listed.tools as Array<{name: string}> | undefined)?.some(tool => tool.name === "popcorn_verify_v2")) {
  throw new Error("Deployed verifier tool is missing");
}

const cases = [];
for (const [index, v] of vectors.entries()) {
  const response = await requestRpc(endpoint, fetch, index + 3, "tools/call", {
    name: "popcorn_verify_v2",
    arguments: {
      response: v.response,
      jwks: { keys: [] }, // Ignored by remote tool: issuer JWKS must be fetched independently.
      expected_payload_digest: v.digest,
      expected_nonce: v.nonce,
    },
  });
  const result = response.structuredContent as { accepted?: boolean; reason?: string; issuer_key_trust_checked_by_tool?: boolean } | undefined;
  const passed = result?.accepted === v.accepted &&
    typeof result?.reason === "string" && v.reason.test(result.reason) &&
    (v.accepted !== true || result.issuer_key_trust_checked_by_tool === true);
  cases.push({ id: v.id, passed, accepted: result?.accepted, reason: result?.reason, issuer_key_trust_checked_by_tool: result?.issuer_key_trust_checked_by_tool });
}
const report = { protocol_id: "POPCORN-WITNESS/2.0", fixture_receipt_id: receipt.witness_receipt.receipt_id, production_issuer_keys_only: true, cases, passed: cases.length === 6 && cases.every(c => c.passed) };
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!report.passed) process.exitCode = 1;
