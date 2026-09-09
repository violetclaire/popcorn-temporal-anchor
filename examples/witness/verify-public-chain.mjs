import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

const packetPath = process.argv[2] ?? "popcorn-test-line-bundle.json";
const packet = JSON.parse(await readFile(packetPath, "utf8"));
const chain = packet.chain ?? packet;

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

function sha256Base64Url(bytes) {
  return createHash("sha256").update(bytes).digest("base64url");
}

function decodeBase64Url(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} is not canonical base64url`);
  }
  return Buffer.from(value, "base64url");
}

function verifyReceipt(label, entry) {
  const compact = entry.paid_evidence.witness_attestation.compact_jws;
  const parts = compact.split(".");
  if (parts.length !== 3) throw new Error(`${label} JWS is malformed`);

  const protectedHeader = JSON.parse(decodeBase64Url(parts[0], `${label} header`));
  const signedPayloadBytes = decodeBase64Url(parts[1], `${label} payload`);
  const signedReceipt = JSON.parse(signedPayloadBytes);
  const signature = decodeBase64Url(parts[2], `${label} signature`);
  const publicKey = createPublicKey({
    key: entry.public_verification_key,
    format: "jwk",
  });

  if (
    protectedHeader.alg !== "ES256" ||
    protectedHeader.typ !== "popcorn-witness+jws" ||
    protectedHeader.kid !== entry.public_verification_key.kid
  ) {
    throw new Error(`${label} protected header does not match the verification key`);
  }
  if (
    !verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    )
  ) {
    throw new Error(`${label} signature is invalid`);
  }
  if (canonicalJson(signedReceipt) !== canonicalJson(entry.paid_evidence.witness_receipt)) {
    throw new Error(`${label} signed payload differs from the receipt envelope`);
  }

  const exactBytes = decodeBase64Url(entry.exact_schedule.bytes, `${label} exact bytes`);
  const expectedDigest = entry.submitted_request.payload_digest.value;
  if (sha256Base64Url(exactBytes) !== expectedDigest) {
    throw new Error(`${label} exact bytes do not match the submitted digest`);
  }
  if (signedReceipt.commitment.payload_digest.value !== expectedDigest) {
    throw new Error(`${label} signed digest does not match the submitted digest`);
  }
  if (signedReceipt.commitment.nonce !== entry.submitted_request.nonce) {
    throw new Error(`${label} signed nonce does not match the submitted nonce`);
  }
  if (
    signedReceipt.evidence_scope.authorization_granted !== false ||
    signedReceipt.evidence_scope.action_execution_proven !== false
  ) {
    throw new Error(`${label} evidence scope overclaims authorization or execution`);
  }

  return { signedPayloadBytes, signedReceipt };
}

if (packet.latest) {
  const latestKey = packet.latest.jwks_at_verification.keys.find(
    (key) => key.kid === packet.latest.witness_response.witness_attestation.key_id,
  );
  if (!latestKey) throw new Error("latest verification key is missing");
  verifyReceipt("latest", {
    exact_schedule: {
      bytes: Buffer.from(packet.latest.payload_utf8, "utf8").toString("base64url"),
    },
    submitted_request: {
      payload_digest: packet.latest.payload_digest,
      nonce: packet.latest.nonce,
    },
    paid_evidence: packet.latest.witness_response,
    public_verification_key: latestKey,
  });
  console.log("latest_signature=valid");
  console.log("latest_payload_digest=valid");
}

const predecessor = verifyReceipt("predecessor", chain.predecessor);
const current = verifyReceipt("current", chain.current);
const claimedPrevious = current.signedReceipt.commitment.previous_attestation_digest;
if (!claimedPrevious || claimedPrevious.algorithm !== "sha-256") {
  throw new Error("current receipt does not claim a SHA-256 predecessor link");
}
const actualPrevious = sha256Base64Url(predecessor.signedPayloadBytes);
if (claimedPrevious.value !== actualPrevious) {
  throw new Error("current receipt does not link to the predecessor signed payload");
}

console.log("predecessor_signature=valid");
console.log("current_signature=valid");
console.log("payload_digests=valid");
console.log("chain_link=valid");
console.log("authorization_granted=false");
console.log("action_execution_proven=false");
