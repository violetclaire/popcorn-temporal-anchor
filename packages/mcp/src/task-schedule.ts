import { createHash } from "node:crypto";
import { verifyPopcornWitnessEvidence, type JsonWebKeySet, type PopcornWitnessResponse } from "../../../verify/typescript/src/index.js";

const fields = ["need", "who", "yes_condition", "boundary_utc", "boundary_rule", "expire_utc", "on_yes", "on_no"] as const;
export type TaskSchedule = Record<typeof fields[number], string>;

export function parseTaskSchedule(bytes: Uint8Array): TaskSchedule {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const lines = text.split("\n");
  if (lines.length !== 9 || lines.pop() !== "") throw new Error("schedule requires exactly eight LF-terminated lines");
  const entries = fields.map((field, index) => {
    const prefix = `${field}: `;
    if (!lines[index].startsWith(prefix)) throw new Error(`missing or out-of-order field: ${field}`);
    const value = lines[index].slice(prefix.length);
    if (!value || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`invalid single-line value: ${field}`);
    return [field, value];
  });
  const schedule = Object.fromEntries(entries) as TaskSchedule;
  for (const field of ["boundary_utc", "expire_utc"] as const) {
    const value = schedule[field];
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace("Z", ".000Z")) {
      throw new Error(`invalid UTC instant: ${field}`);
    }
  }
  if (!["yes_if_before", "yes_if_on_or_before"].includes(schedule.boundary_rule) ||
      schedule.on_yes !== "PROCEED" || !["STOP", "REFER", "COUNTER"].includes(schedule.on_no)) {
    throw new Error("invalid schedule rule or action");
  }
  return schedule;
}

/** False/unknown conditions short-circuit; only true needs a fresh verified interval. */
export function evaluateTaskSchedule(schedule: TaskSchedule, L: number, U: number, condition: boolean | null): string {
  if (condition === null) return "STOP";
  if (!condition) return schedule.on_no;
  if (!Number.isFinite(L) || !Number.isFinite(U) || L > U) return "STOP";
  const E = Date.parse(schedule.expire_utc), B = Date.parse(schedule.boundary_utc);
  if (!Number.isFinite(E) || !Number.isFinite(B)) return "STOP";
  if (L >= E) return "STOP";
  if (U >= E) return "REFETCH";
  if (schedule.boundary_rule === "yes_if_before") return U < B ? schedule.on_yes : L >= B ? schedule.on_no : "REFETCH";
  if (schedule.boundary_rule === "yes_if_on_or_before") return U <= B ? schedule.on_yes : L > B ? schedule.on_no : "REFETCH";
  return "STOP";
}

export type TaskSchedulePacket = {
  format: string;
  historical_evidence: boolean;
  schedule_base64url: string;
  schedule_utf8: string;
  byte_length: number;
  payload_digest: { algorithm: string; value: string };
  nonce: string;
  witness_response: PopcornWitnessResponse;
  jwks_at_verification: JsonWebKeySet;
};

export async function verifyTaskScheduleSample(packet: TaskSchedulePacket) {
  if (packet.format !== "TASK-SCHEDULE/1.0" || packet.historical_evidence !== true) throw new Error("not a historical task-schedule sample");
  const bytes = Buffer.from(packet.schedule_base64url, "base64url");
  if (bytes.toString("base64url") !== packet.schedule_base64url || bytes.length !== packet.byte_length ||
      !Buffer.from(packet.schedule_utf8, "utf8").equals(bytes)) throw new Error("sample byte encodings differ");
  const schedule = parseTaskSchedule(bytes);
  const digest = createHash("sha256").update(bytes).digest("base64url");
  if (packet.payload_digest.algorithm !== "sha-256" || digest !== packet.payload_digest.value) throw new Error("sample digest mismatch");
  const options = { expected_payload: bytes, expected_nonce: packet.nonce, expected_node_id: "767-2676.com", max_clock_accuracy_radius_ms: 10000 };
  const verified = await verifyPopcornWitnessEvidence(packet.witness_response, packet.jwks_at_verification, options);
  const tampered = Buffer.from(bytes);
  const whoOffset = bytes.indexOf(Buffer.from("who: ")) + 5;
  tampered[whoOffset] ^= 1;
  let tamperRejected = false;
  try { await verifyPopcornWitnessEvidence(packet.witness_response, packet.jwks_at_verification, { ...options, expected_payload: tampered }); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes("payload digest does not match the expected payload")) throw error;
    tamperRejected = true;
  }
  if (!tamperRejected) throw new Error("who-field tampering was accepted");
  return {
    origin: "https://767-2676.com", format: packet.format, verified: true, digest_matches: true,
    byte_length: bytes.length, who: schedule.who, sha256: digest,
    window: verified.witness_window_utc, one_byte_who_tamper_rejected: true,
    historical_evidence: true, establishes_current_time: false, authorization_granted: false,
    payment_sent: false, network_request_made: false,
    key_trust: "Bundled historical public keys reproduce this sample; obtain trusted issuer keys independently for a real task.",
  };
}
