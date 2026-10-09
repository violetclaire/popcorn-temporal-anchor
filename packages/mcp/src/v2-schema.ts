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
    expected_issuer_key_thumbprint_sha256: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    ...previous,
  });
}

export const localVerifyV2Schema = verifySchema(8, false, true);
export const remoteVerifyV2Schema = verifySchema(8, true, true);
