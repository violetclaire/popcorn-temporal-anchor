import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  verifyPopcornTemporalEvidence,
  verifyPopcornWitnessEvidence,
  type JsonWebKeySet,
  type PopcornResponse,
  type PopcornWitnessResponse,
} from "../src/index.js";

const vector = JSON.parse(
  await readFile(
    new URL("../../test-vectors/popcorn-receipt-v1.json", import.meta.url),
    "utf8",
  ),
);

const witnessVector = JSON.parse(
  await readFile(
    new URL("../../test-vectors/popcorn-witness-receipt-v1.json", import.meta.url),
    "utf8",
  ),
);
const witnessResponse = witnessVector.paid_evidence;
const witnessJwks = { keys: [witnessVector.public_verification_key] };
const witnessPayload = Buffer.from(witnessVector.exact_schedule.bytes, "base64url");

const proceedPacket = JSON.parse(
  await readFile(
    new URL(
      "../../../examples/witness/evaluation-packet.proceed-002.production.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const proceedPayload = Buffer.from(proceedPacket.exact_schedule.bytes, "base64url");

test("verifies the shared positive vector and computes the conservative interval", async () => {
  const result = await verifyPopcornTemporalEvidence(
    vector.response,
    vector.jwks,
    vector.client_observation,
    { execution_window_utc: vector.execution_window_utc },
  );
  assert.equal(result.key_id, vector.expected.key_id);
  assert.equal(result.paid_request_rtt_ms, vector.expected.paid_request_rtt_ms);
  assert.equal(result.network_uncertainty_ms, vector.expected.network_uncertainty_ms);
  assert.equal(
    result.remaining_validity_at_receipt_ms,
    vector.expected.remaining_validity_at_receipt_ms,
  );
  assert.equal(
    result.remaining_validity_now_ms,
    vector.expected.remaining_validity_now_ms,
  );
  assert.equal(
    result.temporal_interval_now_utc.earliest,
    vector.expected.earliest_server_time_now_utc,
  );
  assert.equal(
    result.temporal_interval_now_utc.latest,
    vector.expected.latest_server_time_now_utc,
  );
  assert.equal(result.execution_window?.eligible, true);
});

test("fails closed when a response field is changed after signing", async () => {
  const tampered = structuredClone(vector.response) as PopcornResponse;
  tampered.temporal_receipt.node_id = "copy.example";
  await assert.rejects(
    verifyPopcornTemporalEvidence(tampered, vector.jwks, vector.client_observation),
    /does not equal the signed payload/,
  );
});

test("fails closed when the protected kid is not in the supplied JWKS", async () => {
  const emptyJwks: JsonWebKeySet = { keys: [] };
  await assert.rejects(
    verifyPopcornTemporalEvidence(vector.response, emptyJwks, vector.client_observation),
    /absent from JWKS/,
  );
});

test("fails closed when evidence is stale at decision time", async () => {
  const result = await verifyPopcornTemporalEvidence(
    vector.response,
    vector.jwks,
    {
      ...vector.client_observation,
      decision_monotonic_ms: vector.negative_cases.expired_decision_monotonic_ms,
    },
    { execution_window_utc: vector.execution_window_utc },
  );
  assert.equal(result.remaining_validity_now_ms, 0);
  assert.deepEqual(result.execution_window, {
    eligible: false,
    next_action: "request_new_temporal_anchor",
    reason: "temporal_evidence_expired",
  });
});

test("fails closed when the uncertainty interval reaches the exclusive close", async () => {
  const result = await verifyPopcornTemporalEvidence(
    vector.response,
    vector.jwks,
    vector.client_observation,
    { execution_window_utc: vector.negative_cases.closed_execution_window_utc },
  );
  assert.equal(result.execution_window?.eligible, false);
  assert.equal(result.execution_window?.next_action, "request_new_temporal_anchor");
});

test("verifies the settled production payload-bound witness receipt", async () => {
  const result = await verifyPopcornWitnessEvidence(
    witnessResponse,
    witnessJwks,
    {
      expected_payload: witnessPayload,
      expected_nonce: witnessVector.submitted_request.nonce,
      max_clock_accuracy_radius_ms: 10_000,
    },
  );
  assert.equal(result.key_id, witnessVector.public_verification_key.kid);
  assert.equal(result.payload_digest_verified, true);
  assert.equal(result.nonce_verified, true);
  assert.equal(result.previous_attestation_digest_matched, false);
  assert.equal(
    result.replay_key,
    witnessVector.expected_verification.exact_schedule.replay_key,
  );
  assert.equal(
    result.payment_replay_key,
    witnessVector.expected_verification.exact_schedule.payment_replay_key,
  );
  assert.deepEqual(
    result.witness_window_utc,
    witnessResponse.witness_receipt.witness_window_utc,
  );
});

test("verifies the settled PROCEED checkpoint inside its schedule window", async () => {
  const result = await verifyPopcornWitnessEvidence(
    proceedPacket.paid_evidence,
    { keys: [proceedPacket.public_verification_key] },
    {
      expected_payload: proceedPayload,
      expected_nonce: proceedPacket.submitted_request.nonce,
      max_clock_accuracy_radius_ms: 10_000,
    },
  );
  const schedule = JSON.parse(proceedPayload.toString("utf8"));
  assert.equal(result.signature_verified, true);
  assert.equal(result.payload_digest_verified, true);
  assert.equal(result.nonce_verified, true);
  assert.ok(
    new Date(result.witness_window_utc.latest) >=
      new Date(schedule.execution_window_utc.opens_at),
  );
  assert.ok(
    new Date(result.witness_window_utc.earliest) <=
      new Date(schedule.execution_window_utc.closes_at),
  );
});

test("rejects a witness receipt presented with different payload bytes", async () => {
  await assert.rejects(
    verifyPopcornWitnessEvidence(witnessResponse, witnessJwks, {
      expected_payload: Buffer.from(
        witnessVector.expected_verification.one_byte_tamper.tampered_bytes,
        "base64url",
      ),
      expected_nonce: witnessVector.submitted_request.nonce,
    }),
    /payload digest does not match/,
  );
});

test("rejects a witness receipt presented with a different nonce", async () => {
  await assert.rejects(
    verifyPopcornWitnessEvidence(witnessResponse, witnessJwks, {
      expected_payload: witnessPayload,
      expected_nonce: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    }),
    /nonce does not match/,
  );
});

test("rejects a witness receipt with the wrong claimed predecessor", async () => {
  await assert.rejects(
    verifyPopcornWitnessEvidence(witnessResponse, witnessJwks, {
      expected_payload: witnessPayload,
      expected_nonce: witnessVector.submitted_request.nonce,
      expected_previous_attestation: "not-the-previous-attestation",
    }),
    /does not contain a previous attestation commitment/,
  );
});

test("rejects altered witness scope after signing", async () => {
  const tampered = structuredClone(
    witnessResponse,
  ) as PopcornWitnessResponse;
  tampered.witness_receipt.evidence_scope.replay_prevented = true;
  await assert.rejects(
    verifyPopcornWitnessEvidence(tampered, witnessJwks, {
      expected_payload: witnessPayload,
      expected_nonce: witnessVector.submitted_request.nonce,
    }),
    /does not equal the signed payload/,
  );
});
