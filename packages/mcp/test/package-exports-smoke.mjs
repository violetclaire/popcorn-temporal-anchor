import assert from "node:assert/strict";
import { popcornHandoff, popcornSample } from "@violetclaire/popcorn-mcp/sample";

import {
  popcornHash,
  popcornVerify,
  popcornVerifyWitnessChain,
  popcornWitness,
} from "@violetclaire/popcorn-mcp/core";

assert.equal(typeof popcornHash, "function");
assert.equal(typeof popcornVerifyWitnessChain, "function");
assert.equal(typeof popcornWitness, "function");
assert.equal(typeof popcornHandoff, "function");
globalThis.fetch = () => { throw new Error("sample exports must work offline"); };
assert.equal((await popcornSample()).v2.accepted, true);
const packet = await popcornHandoff();
assert.equal(packet.payment_sent, false);
assert.equal(packet.network_request_made, false);
assert.equal(packet.authorization_granted, false);
const { response, jwks, ...verification } = packet.input;
const input = { receipt_type: "witness", response, jwks, verification };
const checked = await popcornVerify(input);
assert.equal(checked.verified.signature_verified, true);
assert.equal(checked.verified.payload_digest_verified, true);
const changed = Buffer.from(verification.expected_payload_base64url, "base64url");
changed[0] ^= 1;
await assert.rejects(popcornVerify({ ...input, verification: {
  ...verification, expected_payload_base64url: changed.toString("base64url"),
} }), /payload digest/);
process.stderr.write("package core and sample exports passed offline handoff verification and tamper rejection\n");
