import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyPopcornWitnessEvidence } from "../../../../verify/typescript/src/v2.js";
import {
  generateTain,
  handlePaidWitnessRequest,
  isValidTain,
  issuePopcornWitnessReceipt,
  sha256Base64Url,
} from "../src/v2.js";

const witnessedMs = Date.parse("2026-09-22T18:00:01.010Z");
const licenseDigest = {
  algorithm: "sha-256" as const,
  value: "cR0ghOOH6DG3SEeoYxPw1b38oL2wf2IjTazGSxi-vIY",
};
const payload = '{"checkpoint_id":"v2-issuer","state":"ready"}\n';
const nonce = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

async function setup() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const request = {
    payload_digest: { algorithm: "sha-256", value: await sha256Base64Url(payload) },
    nonce,
    previous_attestation_digest: null,
  };
  const options = {
    receipt_id: "pwr_00000000000000000000000000000001",
    signing_key: pair.privateKey,
    signing_key_id: "v2-issuer-test-key",
    request_received_at_ms: witnessedMs - 10,
    clock_accuracy_radius_ms: 1000,
    payment_identifier: "test_only_no_settlement",
    payment_transaction: null,
    license_terms_digest: licenseDigest,
    now_ms: (() => {
      const ticks = [witnessedMs, witnessedMs + 10];
      return () => ticks.shift() as number;
    })(),
  };
  const jwks = {
    keys: [{ ...publicJwk, use: "sig", alg: "ES256", kid: options.signing_key_id }],
  };
  return { request, options, jwks };
}

test("TAIN uses witnessed milliseconds and 80 CSPRNG bits", () => {
  assert.equal(witnessedMs, 1790100001010); // The PDF's printed numeric millisecond value is a typo.
  const seen = new Set<string>();
  for (let i = 0; i < 10_000; i++) {
    const id = generateTain(witnessedMs);
    assert.equal(isValidTain(id), true);
    assert.equal(id.slice(5, 15), "01M354CM7J");
    assert.equal(seen.has(id), false);
    seen.add(id);
  }
  assert.equal(generateTain(witnessedMs - 1) < generateTain(witnessedMs + 1), true);
  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => generateTain(invalid), /non-negative safe integer/);
  }
});

test("v2 issuer signs TAIN, provenance, and license metadata", async () => {
  const { request, options, jwks } = await setup();
  const response = await issuePopcornWitnessReceipt(request, options);
  const receipt = response.witness_receipt;
  assert.equal(receipt.protocol_id, "POPCORN-WITNESS/2.0");
  assert.equal(receipt.tain.slice(5, 15), "01M354CM7J");
  assert.equal(receipt.issuing_origin, "https://767-2676.com");
  assert.equal(receipt.issuance_endpoint, "/v1/receipt");
  assert.equal(receipt.tain_verification_uri, `https://767-2676.com/v1/receipt/tain/${receipt.tain}`);
  assert.equal(receipt.contribution_license_uri, "https://767-2676.com/license/contribution/1.0");
  assert.deepEqual(receipt.license_terms_digest, licenseDigest);
  const verified = await verifyPopcornWitnessEvidence(response, jwks, {
    expected_payload: payload,
    expected_nonce: nonce,
  });
  assert.equal(verified.signature_verified, true);
  assert.match(verified.replay_key, /^POPCORN-WITNESS\/2\.0:/);
  for (const field of ["tain", "issuing_origin", "issuance_endpoint", "tain_verification_uri", "contribution_license_uri", "license_terms_digest"]) {
    const changed = structuredClone(response) as unknown as { witness_receipt: Record<string, unknown> };
    changed.witness_receipt[field] = field === "license_terms_digest"
      ? { algorithm: "sha-256", value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }
      : "tampered";
    await assert.rejects(
      verifyPopcornWitnessEvidence(changed as typeof response, jwks, { expected_payload: payload, expected_nonce: nonce }),
      /does not equal the signed payload/,
    );
  }
});

test("v2 HTTP reference handler labels its response and requires the license digest", async () => {
  const { request, options } = await setup();
  const http = await handlePaidWitnessRequest(new Request("https://767-2676.com/v1/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }), options);
  assert.equal(http.status, 200);
  assert.equal(http.headers.get("X-POPCORN-Protocol"), "POPCORN-WITNESS/2.0");
  const body = await http.json();
  assert.equal(body.witness_receipt.protocol_id, "POPCORN-WITNESS/2.0");
  const bad = await setup();
  await assert.rejects(
    issuePopcornWitnessReceipt(bad.request, { ...bad.options, license_terms_digest: { ...licenseDigest, value: "bad" } }),
    /license_terms_digest must be an unpadded base64url SHA-256 digest/,
  );
  await assert.rejects(
    issuePopcornWitnessReceipt(bad.request, { ...bad.options, node_id: "other.example" }),
    /node_id must be 767-2676.com/,
  );
  await assert.rejects(
    issuePopcornWitnessReceipt(bad.request, { ...bad.options, clock_accuracy_radius_ms: 60_001 }),
    /clock_accuracy_radius_ms exceeds 60000/,
  );
});
