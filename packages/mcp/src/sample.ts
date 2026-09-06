import { readFile } from "node:fs/promises";

import {
  evaluateWitnessAgainstSchedule,
  verifyPopcornWitnessEvidence,
  type PopcornJsonWebKey,
  type PopcornWitnessResponse,
  type PortableScheduleExecutionWindowUtc,
} from "../../../verify/typescript/src/index.js";

const SAMPLE_FILES = [
  "evaluation-packet.production.json",
  "evaluation-packet.proceed-002.production.json",
] as const;

type SamplePacket = {
  evaluation_only: boolean;
  exact_schedule: { bytes: string; byte_length: number };
  submitted_request: { nonce: string };
  paid_evidence: PopcornWitnessResponse;
  public_verification_key: PopcornJsonWebKey;
  expected_verification: {
    one_byte_tamper: { tampered_byte_offset: number; tampered_bytes: string };
  };
};

async function verifySample(filename: typeof SAMPLE_FILES[number]) {
  const packet: SamplePacket = JSON.parse(await readFile(
    new URL(`../../../examples/witness/${filename}`, import.meta.url), "utf8",
  ));
  if (packet.evaluation_only !== true) throw new Error("sample must be evaluation-only");
  const bytes = Buffer.from(packet.exact_schedule.bytes, "base64url");
  if (bytes.byteLength !== packet.exact_schedule.byte_length) {
    throw new Error("sample byte length does not match");
  }
  const keys = { keys: [packet.public_verification_key] };
  const options = {
    expected_payload: bytes,
    expected_nonce: packet.submitted_request.nonce,
    expected_node_id: "767-2676.com",
    max_clock_accuracy_radius_ms: 10_000,
  };
  const verified = await verifyPopcornWitnessEvidence(packet.paid_evidence, keys, options);
  const task: { schedule_id: string; execution_window_utc: PortableScheduleExecutionWindowUtc } =
    JSON.parse(bytes.toString("utf8"));
  const timeCheck = evaluateWitnessAgainstSchedule(
    verified.witness_window_utc, task.execution_window_utc,
  );

  const control = packet.expected_verification.one_byte_tamper;
  const tampered = Buffer.from(control.tampered_bytes, "base64url");
  const changedOffsets = [...bytes.keys()].filter((index) => bytes[index] !== tampered[index]);
  if (tampered.length !== bytes.length || changedOffsets.length !== 1 ||
      changedOffsets[0] !== control.tampered_byte_offset) {
    throw new Error("sample tamper control must change exactly the published byte");
  }
  let tamperRejected = false;
  try {
    await verifyPopcornWitnessEvidence(packet.paid_evidence, keys, {
      ...options, expected_payload: tampered,
    });
  } catch (error) {
    if (!(error instanceof Error) ||
        !error.message.includes("payload digest does not match the expected payload")) throw error;
    tamperRejected = true;
  }
  if (!tamperRejected) throw new Error("sample tamper control was accepted");

  return {
    sample_id: task.schedule_id,
    source: `https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/examples/witness/${filename}`,
    byte_length: bytes.byteLength,
    receipt_id: verified.witness_receipt.receipt_id,
    signature_verified: verified.signature_verified,
    payload_digest_verified: verified.payload_digest_verified,
    nonce_verified: verified.nonce_verified,
    historical_time_check: timeCheck,
    one_byte_tamper_rejected: tamperRejected,
  };
}

/** Reproduce two bundled historical receipts with the maintained offline verifier. */
export async function popcornSample() {
  return {
    evaluation_only: true,
    payment_sent: false,
    network_request_made: false,
    authorization_granted: false,
    key_trust: "Bundled historical sample keys are used for reproduction. Select trusted issuer keys independently for real tasks.",
    time_scope: "These results describe historical checkpoints. They do not establish current time or permission to act now.",
    examples: await Promise.all(SAMPLE_FILES.map(verifySample)),
  };
}
