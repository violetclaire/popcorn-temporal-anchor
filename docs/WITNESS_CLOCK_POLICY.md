# Witness clock policy

## Source and observation point

The Worker records `Date.now()` immediately after x402 settlement returns and before it creates and signs the witness statement. In Cloudflare Workers, JavaScript time is tied to the most recent I/O event and remains fixed during CPU-only execution. The response therefore states the request, witness, and statement-creation timestamps separately instead of pretending they are one atomic instant.

Cloudflare documents its network time service as synchronized with stratum-1 providers. POPCORN does not independently audit Cloudflare's clock and does not claim atomic-clock alignment.

## Accuracy statement

The production configuration declares a `10,000 ms` clock-accuracy radius. This is a conservative issuer-declared operating bound used to form `witness_window_utc.earliest` and `witness_window_utc.latest`. It is not an independent measurement, external certification, SLA, or guarantee.

Every receipt explicitly states:

- `external_atomic_clock_alignment_proven: false`; and
- `clock_accuracy_independently_verified: false`.

Consumers must choose their own maximum acceptable radius and fail closed when the receipt's radius exceeds it.

## Failure and incident policy

Issuance fails closed when the witness key, key identifier, accuracy radius, payment configuration, or facilitator response is missing or invalid. During a known clock-integrity incident, the witness service state must be set to `disabled` and issuance must remain unavailable until the operator has investigated and deliberately restored service.

The public key set supports key identification and rotation. Historical evidence remains verifiable only while its public key is retained in the published key history.

## Logging and privacy

Operational logs must not include raw request bodies, digests, nonces, compact JWS values, or reusable payment proofs. The service has no payload store and no global witness-replay database.

## Primary platform references

- Cloudflare Workers time behavior: https://developers.cloudflare.com/workers/runtime-apis/performance/
- Cloudflare Workers security model: https://developers.cloudflare.com/workers/reference/security-model/
- Cloudflare Time Services: https://developers.cloudflare.com/time-services/
- Cloudflare Roughtime: https://developers.cloudflare.com/time-services/roughtime/
