import assert from "node:assert/strict";
import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  digestWitnessSignedPayload,
  verifyPopcornWitnessEvidence,
  type PopcornWitnessResponse,
} from "../src/v2.js";

const vector = JSON.parse(await readFile(new URL("../../test-vectors/popcorn-witness-receipt-v2.json", import.meta.url), "utf8"));
const chain = JSON.parse(await readFile(new URL("../../test-vectors/popcorn-witness-chain-v2.json", import.meta.url), "utf8"));
const legacy = JSON.parse(await readFile(new URL("../../test-vectors/popcorn-witness-receipt-v1.json", import.meta.url), "utf8"));
const payload = Buffer.from(vector.exact_payload.bytes, "base64url");
const jwks = { keys: [vector.public_verification_key] };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function resign(mutator: (receipt: Record<string, unknown>) => void): PopcornWitnessResponse {
  const response = structuredClone(vector.paid_evidence) as PopcornWitnessResponse;
  mutator(response.witness_receipt as unknown as Record<string, unknown>);
  const header = response.witness_attestation.compact_jws.split(".")[0];
  const encodedPayload = Buffer.from(canonicalJson(response.witness_receipt)).toString("base64url");
  const signingInput = `${header}.${encodedPayload}`;
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC", crv: "P-256",
      x: vector.public_verification_key.x,
      y: vector.public_verification_key.y,
      d: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE", // fixture-only P-256 scalar 1
    },
  });
  const signature = sign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  response.witness_attestation.compact_jws = `${signingInput}.${signature.toString("base64url")}`;
  return response;
}

test("cross-language deterministic v2 vector verifies and binds the approved license digest", async () => {
  const result = await verifyPopcornWitnessEvidence(vector.paid_evidence, jwks, {
    expected_payload: payload,
    expected_nonce: vector.submitted_request.nonce,
  });
  assert.equal(result.signature_verified, true);
  assert.equal(result.witness_receipt.protocol_id, "POPCORN-WITNESS/2.0");
  assert.equal(result.witness_receipt.issuance_endpoint, "/v1/receipt");
  assert.equal(result.witness_receipt.tain, "tain_01M354CM7J0000000000000001");
  assert.equal(result.replay_key.startsWith("POPCORN-WITNESS/2.0:"), true);
  const licenseBytes = await readFile(new URL("../../../reference/contribution-license/1.0.txt", import.meta.url));
  const digest = await crypto.subtle.digest("SHA-256", licenseBytes);
  assert.equal(Buffer.from(digest).toString("base64url"), result.witness_receipt.license_terms_digest.value);
  assert.equal(
    await digestWitnessSignedPayload(vector.paid_evidence.witness_attestation.compact_jws),
    vector.expected_signed_payload_digest,
  );
});

test("v2 verifier accepts either signed issuance route and rejects other routes", async () => {
  const current = resign((receipt) => { receipt.issuance_endpoint = "/v2/receipt"; });
  const result = await verifyPopcornWitnessEvidence(current, jwks, {
    expected_payload: payload,
    expected_nonce: vector.submitted_request.nonce,
  });
  assert.equal(result.signature_verified, true);
  assert.equal(result.witness_receipt.issuance_endpoint, "/v2/receipt");

  for (const route of ["/v3/receipt", "/v2/receipt/", "https://767-2676.com/v2/receipt"]) {
    const changed = resign((receipt) => { receipt.issuance_endpoint = route; });
    await assert.rejects(
      verifyPopcornWitnessEvidence(changed, jwks, {
        expected_payload: payload,
        expected_nonce: vector.submitted_request.nonce,
      }),
      /provenance or license URI is invalid/,
    );
  }
});

test("v2 chained vector verifies an exact signed-payload predecessor", async () => {
  const predecessor = chain.predecessor;
  const current = chain.current;
  const result = await verifyPopcornWitnessEvidence(
    current.paid_evidence,
    { keys: [current.public_verification_key] },
    {
      expected_payload: Buffer.from(current.exact_payload.bytes, "base64url"),
      expected_nonce: current.submitted_request.nonce,
      previous_receipt: {
        response: predecessor.paid_evidence,
        jwks: { keys: [predecessor.public_verification_key] },
        verification: {
          expected_payload: Buffer.from(predecessor.exact_payload.bytes, "base64url"),
          expected_nonce: predecessor.submitted_request.nonce,
        },
      },
    },
  );
  assert.equal(result.previous_attestation_digest_matched, true);
  assert.equal(current.submitted_request.previous_attestation_digest.value, chain.expected_previous_signed_payload_digest);
});

test("new verifier rejects historical 1.0 and signed missing or malformed TAIN", async () => {
  await assert.rejects(
    verifyPopcornWitnessEvidence(legacy.paid_evidence, { keys: [legacy.public_verification_key] }, {
      expected_payload: Buffer.from(legacy.exact_schedule.bytes, "base64url"),
      expected_nonce: legacy.submitted_request.nonce,
    }),
    /witness_receipt contains missing or unsupported fields/,
  );
  for (const [mutate, expected] of [
    [(receipt: Record<string, unknown>) => { delete receipt.tain; }, /witness_receipt contains missing or unsupported fields/],
    [(receipt: Record<string, unknown>) => { receipt.tain = "tain_bad"; }, /witness receipt tain is missing or malformed/],
    [(receipt: Record<string, unknown>) => {
      receipt.tain = "tain_01M354CM7K0000000000000001";
      receipt.tain_verification_uri = `https://767-2676.com/v1/receipt/tain/${receipt.tain}`;
    }, /tain does not match witnessed_at_utc/],
  ] as const) {
    const changed = resign(mutate);
    await assert.rejects(
      verifyPopcornWitnessEvidence(changed, jwks, { expected_payload: payload, expected_nonce: vector.submitted_request.nonce }),
      expected,
    );
  }
});

test("new verifier checks signed provenance and license but ignores unsigned presentation", async () => {
  for (const mutate of [
    (receipt: Record<string, unknown>) => { receipt.issuing_origin = "https://copy.example"; },
    (receipt: Record<string, unknown>) => { receipt.tain_verification_uri = "https://copy.example/verify"; },
    (receipt: Record<string, unknown>) => { receipt.contribution_license_uri = "https://copy.example/license"; },
  ]) {
    await assert.rejects(
      verifyPopcornWitnessEvidence(resign(mutate), jwks, { expected_payload: payload, expected_nonce: vector.submitted_request.nonce }),
      /provenance or license URI is invalid/,
    );
  }
  const full = {
    ...vector.paid_evidence,
    tain_qr_png_base64: "arbitrary unsigned image data",
    tain_qr_payload: "not even JSON",
    letterhead_uri: "https://example.com/unsigned-display",
    optional_display_field: { version: 3 },
  };
  for (const response of [
    full,
    { ...full, tain_qr_payload: "changed" },
    { ...full, tain_qr_payload: "{\"verify_uri\":\"wrong\"}" },
    { ...full, tain_qr_payload: undefined, letterhead_uri: undefined },
  ]) {
    const verified = await verifyPopcornWitnessEvidence(response, jwks, {
      expected_payload: payload,
      expected_nonce: vector.submitted_request.nonce,
    });
    assert.equal(verified.signature_verified, true);
  }
  // A modified signed receipt must never be accepted merely because presentation is ignored.
  const changedSignedReceipt = structuredClone(full);
  changedSignedReceipt.witness_receipt.commitment.nonce = "A".repeat(43);
  await assert.rejects(
    verifyPopcornWitnessEvidence(changedSignedReceipt, jwks, {
      expected_payload: payload,
      expected_nonce: vector.submitted_request.nonce,
    }),
    /response witness_receipt does not equal the signed payload/,
  );
  const missingAttestation = { ...full } as Record<string, unknown>;
  delete missingAttestation.witness_attestation;
  await assert.rejects(
    verifyPopcornWitnessEvidence(missingAttestation as unknown as PopcornWitnessResponse, jwks, {
      expected_payload: payload,
      expected_nonce: vector.submitted_request.nonce,
    }),
    /response is missing witness_attestation/,
  );
});
