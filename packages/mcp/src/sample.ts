import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { verifyTaskScheduleSample } from "./task-schedule.js";
import { verifyV2, type VerifyV2Input } from "./v2-interface.js";

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

/** A real, already-settled 2.0 receipt. Reproduction never requests a new receipt. */
async function verifyV2Sample() {
  const packet: {
    evaluation_only: boolean;
    source: { checkpoint: string; keys: string; receipt: string };
    exact_payload: { bytes: string; byte_length: number };
    submitted_request: { payload_digest: string; nonce: string };
    response: VerifyV2Input["response"];
    jwks: VerifyV2Input["jwks"];
  } = JSON.parse(await readFile(new URL("../../../examples/witness/v2-production-sample.json", import.meta.url), "utf8"));
  const bytes = Buffer.from(packet.exact_payload.bytes, "base64url");
  if (packet.evaluation_only !== true || bytes.length !== packet.exact_payload.byte_length || !bytes.length) {
    throw new Error("invalid historical v2 sample");
  }
  const digest = createHash("sha256").update(bytes).digest("base64url");
  if (digest !== packet.submitted_request.payload_digest) throw new Error("v2 sample digest mismatch");
  const input: VerifyV2Input = {
    response: packet.response,
    jwks: packet.jwks,
    expected_payload_base64url: bytes.toString("base64url"),
    expected_nonce: packet.submitted_request.nonce,
    expected_node_id: "767-2676.com",
    max_clock_accuracy_radius_ms: 10_000,
  };
  const verified = await verifyV2(input);
  if (!verified.accepted) throw new Error(`v2 sample did not verify: ${verified.reason}`);
  const tamperedBytes = Buffer.from(bytes);
  tamperedBytes[0] ^= 1;
  const payloadControl = await verifyV2({ ...input, expected_payload_base64url: tamperedBytes.toString("base64url") });
  const alteredResponse = structuredClone(packet.response);
  const parts = alteredResponse.witness_attestation.compact_jws.split(".");
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  parts[2] = signature.toString("base64url");
  alteredResponse.witness_attestation.compact_jws = parts.join(".");
  const signatureControl = await verifyV2({ ...input, response: alteredResponse });
  if (payloadControl.accepted || signatureControl.accepted) throw new Error("v2 sample tamper control was accepted");
  return {
    ...verified,
    source: packet.source,
    historical: true,
    establishes_current_time: false,
    byte_length: bytes.length,
    payload_digest: digest,
    one_byte_tamper_rejected: !payloadControl.accepted,
    altered_signature_rejected: !signatureControl.accepted,
    witness_window_utc: packet.response.witness_receipt.witness_window_utc,
  };
}

/** Reproduce bundled historical v1/v2 receipts with offline verification. */
export async function popcornSample() {
  return {
    evaluation_only: true,
    payment_sent: false,
    network_request_made: false,
    authorization_granted: false,
    key_trust: "Bundled historical sample keys are used for reproduction. Select trusted issuer keys independently for real tasks.",
    time_scope: "These results describe historical checkpoints. They do not establish current time or permission to act now.",
    task_schedule: await verifyTaskScheduleSample(JSON.parse(await readFile(new URL("../../../examples/task-schedule/packet.json", import.meta.url), "utf8"))),
    examples: await Promise.all(SAMPLE_FILES.map(verifySample)),
    v2: await verifyV2Sample(),
  };
}

/** Portable public evidence for an agent-to-agent handoff; nothing is sent. */
export async function popcornHandoff() {
  const checked = await verifyV2Sample();
  const packet = JSON.parse(await readFile(new URL("../../../examples/witness/v2-production-sample.json", import.meta.url), "utf8"));
  return {
    schema: "popcorn-agent-handoff/1.0",
    service: "https://767-2676.com",
    message: "POPCORN witnesses an exact digest. This packet contains a public historical receipt and exact bytes you can verify yourself. Fresh receipts cost $0.001 USDC on Base; local verification is free.",
    historical: true,
    authorization_granted: false,
    payment_sent: false,
    network_request_made: false,
    verification: checked,
    key_trust: "Bundled keys reproduce this public historical example. Obtain trusted issuer keys independently for your own evidence.",
    input: {
      response: packet.response,
      jwks: packet.jwks,
      expected_payload_base64url: packet.exact_payload.bytes,
      expected_nonce: packet.submitted_request.nonce,
      expected_node_id: "767-2676.com",
      max_clock_accuracy_radius_ms: 10_000,
    },
    reproduce: "popcorn-mcp verify-v2 handoff.json",
    source: "https://github.com/violetclaire/popcorn-temporal-anchor/releases/tag/agent-adoption-v0.1.4",
  };
}
