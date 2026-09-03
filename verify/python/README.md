# Python verifiers

`popcorn_verify.py` verifies POPCORN/1.0 ES256 temporal evidence without any
network call. The caller supplies the response, a JWKS selected by local
policy, and timestamps from one monotonic timer. The function returns the
conservative time interval and fails closed for stale or ambiguous execution
windows.

```bash
python -m pip install -r requirements.txt
python -m unittest -v test_popcorn_verify.py
```

The tests consume the exact same public vector as the TypeScript verifier.

`verify_popcorn_witness_evidence` additionally verifies a
`POPCORN-WITNESS/1.0` state checkpoint against the exact original payload,
nonce, and optional verified predecessor receipt:

```python
verified = verify_popcorn_witness_evidence(
    response,
    jwks,
    expected_payload=exact_payload_bytes,
    expected_nonce=original_nonce,
    previous_receipt={
        "response": previous_response,
        "jwks": previous_jwks,
        "verification": {
            "expected_payload": previous_exact_payload_bytes,
            "expected_nonce": previous_nonce,
        },
    },
    max_clock_accuracy_radius_ms=10_000,
)
replay_key = verified["replay_key"]

judgment = evaluate_witness_against_schedule(
    verified["witness_window_utc"],
    schedule["execution_window_utc"],
)
# STOP, TIME_CHECK_PASSED, or RECHECK. Never authorization.
```

The verifier returns the replay key; the participant remains responsible for
remembering accepted keys and applying its own idempotency policy.

`evaluate_witness_against_schedule` applies the same deterministic rule as the
TypeScript verifier. The complete witness interval must be inside the schedule
to return `TIME_CHECK_PASSED`; an interval outside returns `STOP`; uncertainty
crossing a boundary returns `RECHECK`. Every result explicitly sets
`authorization_granted` to `False`.

The witness tests use the settled production packet in
`../test-vectors/popcorn-witness-receipt-v1.json` and independently reject its
published one-byte tamper case.
The suite also reproduces STOP and TIME_CHECK_PASSED from the two settled
production packets and tests the RECHECK boundary.
