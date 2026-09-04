import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  digestWitnessSignedPayload,
  evaluateWitnessAgainstSchedule,
  verifyPopcornTemporalEvidence,
  verifyPopcornWitnessChain,
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

const stopPacket = JSON.parse(
  await readFile(
    new URL(
      "../../../examples/witness/evaluation-packet.production.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const stopPayload = Buffer.from(stopPacket.exact_schedule.bytes, "base64url");

const chainVector = JSON.parse(
  await readFile(
    new URL(
      "../../test-vectors/popcorn-witness-chain-003.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const chainCurrentPayload = Buffer.from(
  chainVector.current.exact_schedule.bytes,
  "base64url",
);
const chainPredecessorPayload = Buffer.from(
  chainVector.predecessor.exact_schedule.bytes,
  "base64url",
);
const chainPredecessor = {
  response: chainVector.predecessor.paid_evidence as PopcornWitnessResponse,
  jwks: { keys: [chainVector.predecessor.public_verification_key] },
  verification: {
    expected_payload: chainPredecessorPayload,
    expected_nonce: chainVector.predecessor.submitted_request.nonce,
    max_clock_accuracy_radius_ms: 10_000,
  },
};

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
  assert.equal(
    evaluateWitnessAgainstSchedule(
      result.witness_window_utc,
      schedule.execution_window_utc,
    ).decision,
    "TIME_CHECK_PASSED",
  );
});

test("verifies receipt 003 and its signed-payload link to receipt 002", async () => {
  const result = await verifyPopcornWitnessEvidence(
    chainVector.current.paid_evidence,
    { keys: [chainVector.current.public_verification_key] },
    {
      expected_payload: chainCurrentPayload,
      expected_nonce: chainVector.current.submitted_request.nonce,
      previous_receipt: chainPredecessor,
      max_clock_accuracy_radius_ms: 10_000,
    },
  );
  assert.equal(result.previous_attestation_digest_matched, true);
  assert.equal(
    await digestWitnessSignedPayload(
      chainVector.predecessor.paid_evidence.witness_attestation.compact_jws,
    ),
    chainVector.expected_verification.previous_signed_payload_digest,
  );
});

test("verifies a chronological witness chain in one pass", async () => {
  const result = await verifyPopcornWitnessChain([
    chainPredecessor,
    {
      response: chainVector.current.paid_evidence,
      jwks: { keys: [chainVector.current.public_verification_key] },
      verification: {
        expected_payload: chainCurrentPayload,
        expected_nonce: chainVector.current.submitted_request.nonce,
        max_clock_accuracy_radius_ms: 10_000,
      },
    },
  ]);

  assert.equal(result.chain_length, 2);
  assert.equal(
    result.entries[0]?.signed_payload_digest,
    chainVector.expected_verification.previous_signed_payload_digest,
  );
  assert.equal(result.entries[0]?.verified.previous_attestation_digest_matched, false);
  assert.equal(result.entries[1]?.verified.previous_attestation_digest_matched, true);
  assert.equal(
    result.head_signed_payload_digest,
    result.entries[1]?.signed_payload_digest,
  );
});

test("flat chain verifier rejects a missing predecessor", async () => {
  await assert.rejects(
    verifyPopcornWitnessChain([
      {
        response: chainVector.current.paid_evidence,
        jwks: { keys: [chainVector.current.public_verification_key] },
        verification: {
          expected_payload: chainCurrentPayload,
          expected_nonce: chainVector.current.submitted_request.nonce,
        },
      },
    ]),
    /entry 0 must start with previous_attestation_digest null/,
  );
});

test("flat chain verifier rejects a tampered predecessor", async () => {
  const tamperedPredecessor = structuredClone(chainPredecessor);
  tamperedPredecessor.response.witness_receipt.payment_transaction = "0xtampered";
  await assert.rejects(
    verifyPopcornWitnessChain([
      tamperedPredecessor,
      {
        response: chainVector.current.paid_evidence,
        jwks: { keys: [chainVector.current.public_verification_key] },
        verification: {
          expected_payload: chainCurrentPayload,
          expected_nonce: chainVector.current.submitted_request.nonce,
        },
      },
    ]),
    /entry 0 verification failed.*does not equal the signed payload/,
  );
});

test("rejects a chained receipt when its predecessor is missing", async () => {
  await assert.rejects(
    verifyPopcornWitnessEvidence(
      chainVector.current.paid_evidence,
      { keys: [chainVector.current.public_verification_key] },
      {
        expected_payload: chainCurrentPayload,
        expected_nonce: chainVector.current.submitted_request.nonce,
      },
    ),
    /previous receipt is required/,
  );
});

test("rejects a chained receipt when its predecessor was tampered", async () => {
  const tamperedPredecessor = structuredClone(chainPredecessor);
  tamperedPredecessor.response.witness_receipt.payment_transaction = "0xtampered";
  await assert.rejects(
    verifyPopcornWitnessEvidence(
      chainVector.current.paid_evidence,
      { keys: [chainVector.current.public_verification_key] },
      {
        expected_payload: chainCurrentPayload,
        expected_nonce: chainVector.current.submitted_request.nonce,
        previous_receipt: tamperedPredecessor,
      },
    ),
    /previous receipt verification failed.*does not equal the signed payload/,
  );
});

test("returns STOP when the verified witness window is entirely after the schedule", async () => {
  const result = await verifyPopcornWitnessEvidence(
    stopPacket.paid_evidence,
    { keys: [stopPacket.public_verification_key] },
    {
      expected_payload: stopPayload,
      expected_nonce: stopPacket.submitted_request.nonce,
      max_clock_accuracy_radius_ms: 10_000,
    },
  );
  const schedule = JSON.parse(stopPayload.toString("utf8"));
  const judgment = evaluateWitnessAgainstSchedule(
    result.witness_window_utc,
    schedule.execution_window_utc,
  );
  assert.equal(judgment.decision, "STOP");
  assert.equal(judgment.authorization_granted, false);
  assert.equal(judgment.reason, "witness_window_entirely_after_execution_window");
});

test("returns RECHECK when clock uncertainty crosses a schedule boundary", () => {
  const judgment = evaluateWitnessAgainstSchedule(
    {
      earliest: "2026-08-31T06:59:55.000Z",
      latest: "2026-08-31T07:00:05.000Z",
    },
    {
      opens_at: "2026-08-31T07:00:00.000Z",
      closes_at: "2026-08-31T08:00:00.000Z",
    },
  );
  assert.equal(judgment.decision, "RECHECK");
  assert.equal(judgment.authorization_granted, false);
  assert.equal(judgment.reason, "witness_uncertainty_crosses_execution_boundary");
});

test("fails closed on an invalid schedule window", () => {
  assert.throws(
    () =>
      evaluateWitnessAgainstSchedule(
        {
          earliest: "2026-08-31T07:00:00.000Z",
          latest: "2026-08-31T07:00:01.000Z",
        },
        {
          opens_at: "2026-08-31T08:00:00.000Z",
          closes_at: "2026-08-31T08:00:00.000Z",
        },
      ),
    /execution_window_utc is not ordered/,
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

test("rejects an unexpected predecessor for a receipt that starts a chain", async () => {
  await assert.rejects(
    verifyPopcornWitnessEvidence(witnessResponse, witnessJwks, {
      expected_payload: witnessPayload,
      expected_nonce: witnessVector.submitted_request.nonce,
      previous_receipt: chainPredecessor,
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
