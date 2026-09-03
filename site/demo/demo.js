const STOP_PACKET_URL = "https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-packet.production.json";
const OUTCOMES_URL = "https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-outcomes.json";

const fields = Object.fromEntries(
  [...document.querySelectorAll("[data-field]")].map((element) => [
    element.dataset.field,
    element,
  ]),
);
const flipButton = document.querySelector('[data-action="flip"]');
const resetButton = document.querySelector('[data-action="reset"]');

let packet = null;
let scheduleBytes = null;

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Base64Url(bytes) {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function verifySignature(sample) {
  const compact = sample.paid_evidence.witness_attestation.compact_jws;
  const [encodedHeader, encodedPayload, encodedSignature] = compact.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) return false;

  const publicJwk = { ...sample.public_verification_key };
  delete publicJwk.popcorn_protocol;
  const key = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signatureValid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  const signedReceipt = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload)));
  return signatureValid && stableJson(signedReceipt) === stableJson(sample.paid_evidence.witness_receipt);
}

function intervalsOverlap(witnessWindow, executionWindow) {
  return Date.parse(witnessWindow.latest) >= Date.parse(executionWindow.opens_at)
    && Date.parse(witnessWindow.earliest) <= Date.parse(executionWindow.closes_at);
}

function byteLabel(byte) {
  const printable = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "·";
  return `0x${byte.toString(16).padStart(2, "0")}  ${printable}`;
}

async function loadPublicSample() {
  const [sampleResponse, outcomeResponse] = await Promise.all([
    fetch(STOP_PACKET_URL, { cache: "no-store", credentials: "omit" }),
    fetch(OUTCOMES_URL, { cache: "no-store", credentials: "omit" }),
  ]);
  if (!sampleResponse.ok || !outcomeResponse.ok) {
    throw new Error("public sample unavailable");
  }

  const [sample, outcomes] = await Promise.all([
    sampleResponse.json(),
    outcomeResponse.json(),
  ]);
  const bytes = decodeBase64Url(sample.exact_schedule.bytes);
  const schedule = JSON.parse(new TextDecoder().decode(bytes));
  const published = outcomes.examples.find((entry) => entry.schedule_id === schedule.schedule_id);
  const receipt = sample.paid_evidence.witness_receipt;
  const digestValid = await sha256Base64Url(bytes) === receipt.commitment.payload_digest.value;
  const signatureValid = await verifySignature(sample);
  const overlap = intervalsOverlap(receipt.witness_window_utc, schedule.execution_window_utc);

  if (
    bytes.byteLength !== 228
    || !published
    || !digestValid
    || !signatureValid
    || overlap
    || published.local_policy_outcome !== "stop"
  ) {
    throw new Error("public sample did not satisfy the STOP checks");
  }

  packet = sample;
  scheduleBytes = bytes;
  fields["byte-length"].textContent = String(bytes.byteLength);
  fields.signature.textContent = "valid";
  fields.overlap.textContent = "false";
  fields["original-byte"].textContent = byteLabel(bytes[226]);
  fields["load-status"].textContent = "Public packet loaded / signature and digest valid";
  flipButton.disabled = false;
}

async function flipPublishedByte() {
  if (!packet || !scheduleBytes) return;
  const tamperCase = packet.expected_verification.one_byte_tamper;
  const tamperedBytes = decodeBase64Url(tamperCase.tampered_bytes);
  const changed = Array.from(scheduleBytes).flatMap(
    (byte, index) => byte === tamperedBytes[index] ? [] : [index],
  );
  const tamperedDigest = await sha256Base64Url(tamperedBytes);
  const expectedDigest = packet.paid_evidence.witness_receipt.commitment.payload_digest.value;

  if (
    changed.length !== 1
    || changed[0] !== 226
    || tamperedDigest === expectedDigest
  ) {
    throw new Error("the published one-byte control is invalid");
  }

  fields["tampered-byte"].textContent = byteLabel(tamperedBytes[226]);
  fields["tamper-result"].dataset.state = "failed-as-expected";
  fields["tamper-result"].querySelector("span").textContent = "Verification failed as expected";
  fields["tamper-result"].querySelector("strong").textContent = tamperCase.result.error_code;
  fields["tamper-result"].querySelector("small").textContent = "The signature is still valid; the changed payload is not.";
  flipButton.disabled = true;
}

function resetTamper() {
  const result = fields["tamper-result"];
  delete result.dataset.state;
  result.querySelector("span").textContent = "Expected error";
  result.querySelector("strong").textContent = "witness_payload_digest_does_not_match_expected";
  result.querySelector("small").textContent = "Run the control to compare the mutated bytes.";
  if (scheduleBytes) {
    fields["tampered-byte"].textContent = byteLabel(decodeBase64Url(packet.expected_verification.one_byte_tamper.tampered_bytes)[226]);
    flipButton.disabled = false;
  }
}

flipButton.addEventListener("click", () => {
  flipPublishedByte().catch((error) => {
    fields["load-status"].textContent = `Control error / ${error.message}`;
  });
});
resetButton.addEventListener("click", resetTamper);

loadPublicSample().catch((error) => {
  fields.signature.textContent = "unavailable";
  fields["load-status"].textContent = `Static facts shown / ${error.message}`;
});
