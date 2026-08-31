import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type {
  JsonWebKeySet,
  PopcornWitnessResponse,
} from "../../../verify/typescript/src/index.js";
import {
  buildPortableOutcome,
  DEFAULT_JWKS_URL,
  DEFAULT_SERVICE_URL,
  type PaymentExchange,
  type PortableScheduleOutcome,
  type WitnessRequest,
  verifyPortableOutcome,
} from "../src/carrier.js";

const paymentExchange: PaymentExchange = {
  payment_required: "captured-payment-required",
  payment_signature: "captured-payment-signature",
  payment_response: "captured-payment-response",
};

async function loadPacket(name: string): Promise<Record<string, any>> {
  return JSON.parse(
    await readFile(
      new URL(`../../witness/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

async function outcomeFromPacket(name: string): Promise<{
  outcome: PortableScheduleOutcome;
  jwks: JsonWebKeySet;
}> {
  const packet = await loadPacket(name);
  const scheduleBytes = Buffer.from(packet.exact_schedule.bytes, "base64url");
  const jwks = { keys: [packet.public_verification_key] } as JsonWebKeySet;
  const outcome = await buildPortableOutcome({
    serviceUrl: DEFAULT_SERVICE_URL,
    keySetUrl: DEFAULT_JWKS_URL,
    scheduleBytes,
    submittedRequest: packet.submitted_request as WitnessRequest,
    paidEvidence: packet.paid_evidence as PopcornWitnessResponse,
    paymentExchange,
    jwks,
  });
  return { outcome, jwks };
}

test("a second client independently reaches STOP for packet 001", async () => {
  const { outcome, jwks } = await outcomeFromPacket(
    "evaluation-packet.production.json",
  );
  const result = await verifyPortableOutcome(outcome, jwks);
  assert.equal(result.valid, true);
  assert.equal(result.judgment.decision, "STOP");
  assert.equal(result.judgment.authorization_granted, false);
});

test("a second client independently reaches TIME_CHECK_PASSED for packet 002", async () => {
  const { outcome, jwks } = await outcomeFromPacket(
    "evaluation-packet.proceed-002.production.json",
  );
  const result = await verifyPortableOutcome(outcome, jwks);
  assert.equal(result.valid, true);
  assert.equal(result.judgment.decision, "TIME_CHECK_PASSED");
  assert.equal(result.judgment.authorization_granted, false);
});

test("a one-byte schedule change fails before a decision is trusted", async () => {
  const { outcome, jwks } = await outcomeFromPacket(
    "evaluation-packet.proceed-002.production.json",
  );
  const tampered = structuredClone(outcome);
  const bytes = Buffer.from(tampered.schedule.bytes, "base64url");
  bytes[0] ^= 1;
  tampered.schedule.bytes = bytes.toString("base64url");
  await assert.rejects(
    verifyPortableOutcome(tampered, jwks),
    /schedule digest does not match/,
  );
});

test("a reported decision is not trusted without recalculation", async () => {
  const { outcome, jwks } = await outcomeFromPacket(
    "evaluation-packet.proceed-002.production.json",
  );
  const altered = structuredClone(outcome);
  altered.reported_judgment.decision = "STOP";
  await assert.rejects(
    verifyPortableOutcome(altered, jwks),
    /reported judgment does not match/,
  );
});

test("a verifier rejects an outcome that points at an untrusted key set", async () => {
  const { outcome, jwks } = await outcomeFromPacket(
    "evaluation-packet.proceed-002.production.json",
  );
  const altered = structuredClone(outcome);
  altered.key_set_url = "https://attacker.invalid/jwks.json";
  await assert.rejects(
    verifyPortableOutcome(altered, jwks),
    /key_set_url is not the trusted key set/,
  );
});
