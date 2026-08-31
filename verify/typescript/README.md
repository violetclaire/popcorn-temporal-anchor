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
exact original payload bytes, original nonce, and—when chained—the previous
compact JWS:

```ts
const verified = await verifyPopcornWitnessEvidence(response, jwks, {
  expected_payload: exactPayloadBytes,
  expected_nonce: originalNonce,
  expected_previous_attestation: previousCompactJws,
});

// Store this locally after accepting the checkpoint.
const replayKey = verified.replay_key;
```

This verifies commitment integrity and predecessor digest binding. Verify the
predecessor attestation independently before inferring an order between signed
bytes. The verifier does not store the replay key or claim that an action was
executed, delivered, or authorized.

Run `npm install && npm run check`. The suite consumes the same public vector
as the Python implementation and covers temporal tampering, unknown keys,
expiry, closed execution windows, payload changes, nonce changes, predecessor
changes, and altered proof scope.
