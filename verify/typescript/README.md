# TypeScript verifiers

This package verifies both POPCORN receipt types entirely in local memory. It
performs no network request, spends no funds, and stores no task data.

For the live `POPCORN/1.0` temporal anchor, the caller supplies the response,
the JWKS it chose to trust, and three values from one monotonic timer.

```ts
const verified = await verifyPopcornTemporalEvidence(response, jwks, {
  paid_request_start_monotonic_ms: start,
  paid_response_receive_monotonic_ms: received,
  decision_monotonic_ms: performance.now(),
}, { execution_window_utc });

if (verified.execution_window?.eligible !== true) {
  // Fail closed: obtain a fresh anchor or terminate under local policy.
}
```

For a payload-bound `POPCORN-WITNESS/1.0` checkpoint, the caller supplies the
exact original payload bytes, original nonce, and, when chained, the previous
receipt with everything needed to verify it:

```ts
const verified = await verifyPopcornWitnessEvidence(response, jwks, {
  expected_payload: exactPayloadBytes,
  expected_nonce: originalNonce,
  previous_receipt: {
    response: previousResponse,
    jwks: previousJwks,
    verification: {
      expected_payload: previousExactPayloadBytes,
      expected_nonce: previousNonce,
    },
  },
  max_clock_accuracy_radius_ms: 10000,
});

// Store this locally after accepting the checkpoint.
const replayKey = verified.replay_key;

const judgment = evaluateWitnessAgainstSchedule(
  verified.witness_window_utc,
  schedule.execution_window_utc,
);
// STOP, TIME_CHECK_PASSED, or RECHECK. Never authorization.
```

This verifies commitment integrity, recursively verifies the predecessor, and
checks the SHA-256 digest of the predecessor's exact decoded signed payload
bytes. The verifier does not store the replay key or claim that an action was
executed, delivered, or authorized.

`evaluateWitnessAgainstSchedule` requires the complete witness uncertainty
interval to be inside the task window before returning `TIME_CHECK_PASSED`.
An interval entirely outside returns `STOP`; one that crosses a boundary
returns `RECHECK`. All three results set `authorization_granted: false`.

Run `npm install && npm run check`. The suite consumes the same settled
production witness vector
as the Python implementation and covers temporal tampering, unknown keys,
expiry, closed execution windows, payload changes, nonce changes, predecessor
changes, altered proof scope, and all three schedule judgments.
