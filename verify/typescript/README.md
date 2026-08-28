# TypeScript verifier

This package verifies a POPCORN ES256 temporal receipt entirely in local
memory. It performs no network request, spends no funds, and stores no task
data. The caller supplies the response, the JWKS it chose to trust, and three
values from one monotonic timer.

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

Run `npm install && npm run check`. The suite consumes the same public vector
as the Python implementation and covers tampering, unknown keys, expiry, and a
closed execution window.
