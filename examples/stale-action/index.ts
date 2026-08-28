import { readFile } from "node:fs/promises";

import { verifyPopcornTemporalEvidence } from "../../verify/typescript/src/index.js";

const vector = JSON.parse(
  await readFile(
    new URL("../../verify/test-vectors/popcorn-receipt-v1.json", import.meta.url),
    "utf8",
  ),
);

const decision = await verifyPopcornTemporalEvidence(
  vector.response,
  vector.jwks,
  {
    ...vector.client_observation,
    decision_monotonic_ms: vector.negative_cases.expired_decision_monotonic_ms,
  },
  { execution_window_utc: vector.execution_window_utc },
);

if (decision.execution_window?.eligible) {
  throw new Error("unsafe example result: stale evidence was accepted");
}

console.log(JSON.stringify(decision.execution_window, null, 2));
