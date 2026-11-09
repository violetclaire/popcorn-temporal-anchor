import * as z from "zod/v4";

const jsonObject = z.record(z.string(), z.unknown());

// The schema itself limits predecessor nesting before a tool handler runs.
// The shared verifier repeats the bound for direct CLI calls.
function verifySchema(depth: number, remote: boolean, top: boolean): z.ZodTypeAny {
  const previous = depth > 0
    ? {
        previous_receipt: z.strictObject({
          response: jsonObject,
          jwks: jsonObject,
          verification: verifySchema(depth - 1, remote, false),
        }).optional(),
      }
    : {};
  return z.strictObject({
    ...(top ? { response: jsonObject, jwks: jsonObject } : {}),
    expected_nonce: z.string(),
    expected_payload_digest: remote ? z.string() : z.string().optional(),
    ...(!remote ? { expected_payload_base64url: z.string().optional() } : {}),
    expected_node_id: z.string().optional(),
    max_clock_accuracy_radius_ms: z.number().int().min(0).optional(),
    ...previous,
  });
}

export const localVerifyV2Schema = verifySchema(8, false, true);
const remoteBaseSchema = verifySchema(8, true, true) as z.ZodObject<Record<string, z.ZodType>>;
export const remoteVerifyV2Schema = remoteBaseSchema.extend({
  jwks: remoteBaseSchema.shape.jwks.describe("Accepted to match the call shape. The check replaces it with the published keys fetched from the fixed POPCORN issuer address."),
  response: remoteBaseSchema.shape.response.describe("The TAIN 2.0 receipt response to verify. Send a digest, never private work."),
  expected_nonce: remoteBaseSchema.shape.expected_nonce.describe("The nonce the receipt must carry."),
  expected_payload_digest: remoteBaseSchema.shape.expected_payload_digest.describe("The payload digest the receipt must carry."),
  expected_node_id: remoteBaseSchema.shape.expected_node_id.describe("Optional. The node id the receipt must carry."),
  previous_receipt: remoteBaseSchema.shape.previous_receipt.describe("Optional. A previous receipt to check this one against."),
  max_clock_accuracy_radius_ms: remoteBaseSchema.shape.max_clock_accuracy_radius_ms.describe("Optional. The largest clock accuracy radius, in milliseconds, the check accepts."),
});
