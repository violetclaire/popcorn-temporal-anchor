#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  evaluateWitnessAgainstSchedule,
  verifyPopcornWitnessEvidence,
} from "../../verify/typescript/src/index.ts";

const HERE = new URL("./", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, HERE), "utf8"));
}

function decodeBase64Url(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function changedOffsets(left, right) {
  assert.equal(left.length, right.length, "tamper must preserve the byte length");
  const offsets = [];
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) offsets.push(index);
  }
  return offsets;
}

async function main() {
  const packet = await readJson("evaluation-packet.production.json");
  const outcomes = await readJson("evaluation-outcomes.json");
  const scheduleBytes = decodeBase64Url(packet.exact_schedule.bytes);
  const tamperCase = packet.expected_verification.one_byte_tamper;
  const tamperedBytes = decodeBase64Url(tamperCase.tampered_bytes);

  assert.equal(packet.evaluation_only, true);
  assert.equal(scheduleBytes.byteLength, 228);
  assert.deepEqual(changedOffsets(scheduleBytes, tamperedBytes), [226]);
  assert.equal(tamperCase.tampered_byte_offset, 226);

  const verification = await verifyPopcornWitnessEvidence(
    packet.paid_evidence,
    { keys: [packet.public_verification_key] },
    {
      expected_payload: scheduleBytes,
      expected_nonce: packet.submitted_request.nonce,
      max_clock_accuracy_radius_ms: 10_000,
    },
  );

  const schedule = JSON.parse(new TextDecoder().decode(scheduleBytes));
  const judgment = evaluateWitnessAgainstSchedule(
    verification.witness_window_utc,
    schedule.execution_window_utc,
  );
  const publishedOutcome = outcomes.examples.find(
    (entry) => entry.schedule_id === schedule.schedule_id,
  );

  assert.ok(publishedOutcome, "published STOP outcome is missing");
  assert.equal(verification.signature_verified, true);
  assert.equal(verification.payload_digest_verified, true);
  assert.equal(judgment.decision, "STOP");
  assert.equal(judgment.authorization_granted, false);
  assert.equal(publishedOutcome.schedule_overlap, false);
  assert.equal(publishedOutcome.local_policy_outcome, "stop");
  assert.deepEqual(
    verification.witness_window_utc,
    publishedOutcome.witness_window_utc,
  );

  let tamperRejected = false;
  try {
    await verifyPopcornWitnessEvidence(
      packet.paid_evidence,
      { keys: [packet.public_verification_key] },
      {
        expected_payload: tamperedBytes,
        expected_nonce: packet.submitted_request.nonce,
        max_clock_accuracy_radius_ms: 10_000,
      },
    );
  } catch (error) {
    assert.match(
      error instanceof Error ? error.message : String(error),
      /payload digest does not match the expected payload/,
    );
    tamperRejected = true;
  }

  assert.equal(tamperRejected, true, "one-byte tamper was not rejected");
  assert.equal(
    tamperCase.result.error_code,
    "witness_payload_digest_does_not_match_expected",
  );

  console.log("cryptographic_verification=valid");
  console.log("schedule_overlap=false");
  console.log("local_policy_outcome=stop");
  console.log(
    `error_code=${tamperCase.result.error_code}`,
  );
}

main().catch((error) => {
  console.error(`verification_failed=${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
