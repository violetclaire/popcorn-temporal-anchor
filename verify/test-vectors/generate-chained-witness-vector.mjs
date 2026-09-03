import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

const predecessor = JSON.parse(
  await readFile(
    new URL(
      "../../examples/witness/evaluation-packet.proceed-002.production.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function signedPayloadBytes(compactJws) {
  const parts = compactJws.split(".");
  if (parts.length !== 3) throw new Error("predecessor compact JWS is invalid");
  return Buffer.from(parts[1], "base64url");
}

const exactScheduleBytes = Buffer.from(
  '{"schedule_id":"popcorn-witness-evaluation-003","task":"verify a chained agent checkpoint","owner":"evaluation-agent","execution_window_utc":{"opens_at":"2026-08-31T07:14:00.000Z","closes_at":"2026-08-31T23:59:59.000Z"}}\n',
  "utf8",
);
const previousDigest = sha256Base64Url(
  signedPayloadBytes(predecessor.paid_evidence.witness_attestation.compact_jws),
);
const submittedRequest = {
  payload_digest: {
    algorithm: "sha-256",
    value: sha256Base64Url(exactScheduleBytes),
  },
  nonce: Buffer.alloc(32, 0x03).toString("base64url"),
  previous_attestation_digest: {
    algorithm: "sha-256",
    value: previousDigest,
  },
};

const witnessedAt = "2026-08-31T07:14:01.010Z";
const receipt = {
  receipt_id: "pwr_00000000000000000000000000000003",
  node_id: "767-2676.com",
  protocol_id: "POPCORN-WITNESS/1.0",
  request_received_at_utc: "2026-08-31T07:14:01.000Z",
  witnessed_at_utc: witnessedAt,
  statement_created_at_utc: witnessedAt,
  unix_time_milliseconds: Date.parse(witnessedAt),
  clock_accuracy_radius_ms: 1000,
  witness_window_utc: {
    earliest: "2026-08-31T07:14:00.010Z",
    latest: "2026-08-31T07:14:02.010Z",
  },
  server_processing_duration_ms: 10,
  post_witness_processing_duration_ms: 0,
  commitment: submittedRequest,
  payment_identifier: "test_vector_only_not_a_settlement",
  payment_transaction: null,
  evidence_scope: {
    type: "payload_commitment_witness",
    payload_disclosed: false,
    caller_identity_proven: false,
    recipient_delivery_proven: false,
    action_execution_proven: false,
    nonce_uniqueness_enforced: false,
    replay_prevented: false,
    authorization_granted: false,
    external_atomic_clock_alignment_proven: false,
    clock_accuracy_independently_verified: false,
    payer_authorization_bound_to_commitment: false,
  },
};

const keyId = "popcorn-witness-chain-test-003";
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const protectedHeader = Buffer.from(
  JSON.stringify({ alg: "ES256", kid: keyId, typ: "popcorn-witness+jws" }),
).toString("base64url");
const encodedPayload = Buffer.from(canonicalJson(receipt)).toString("base64url");
const signingInput = `${protectedHeader}.${encodedPayload}`;
const signature = sign("sha256", Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: "ieee-p1363",
}).toString("base64url");
const publicJwk = publicKey.export({ format: "jwk" });

const vector = {
  test_only: true,
  description:
    "Synthetic cryptographic conformance vector. Receipt 003 points to the exact signed payload bytes of settled production receipt 002. The 003 payment fields are not evidence of a settlement.",
  protocol_id: "POPCORN-WITNESS/1.0",
  predecessor: {
    exact_schedule: predecessor.exact_schedule,
    submitted_request: predecessor.submitted_request,
    paid_evidence: predecessor.paid_evidence,
    public_verification_key: predecessor.public_verification_key,
  },
  current: {
    exact_schedule: {
      encoding: "base64url",
      byte_length: exactScheduleBytes.byteLength,
      bytes: exactScheduleBytes.toString("base64url"),
      payload_digest: submittedRequest.payload_digest,
    },
    submitted_request: submittedRequest,
    paid_evidence: {
      witness_receipt: receipt,
      witness_attestation: {
        format: "JWS",
        algorithm: "ES256",
        key_id: keyId,
        key_set: "/.well-known/popcorn-keys.json",
        compact_jws: `${signingInput}.${signature}`,
      },
      payment_status: "settled",
    },
    public_verification_key: {
      ...publicJwk,
      use: "sig",
      alg: "ES256",
      kid: keyId,
      popcorn_protocol: "POPCORN-WITNESS/1.0",
    },
  },
  expected_verification: {
    previous_signed_payload_digest: previousDigest,
    previous_attestation_digest_matched: true,
    authorization_granted: false,
  },
};

process.stdout.write(`${JSON.stringify(vector, null, 2)}\n`);
