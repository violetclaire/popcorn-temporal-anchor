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
nonce, and optional previous compact JWS:

```python
verified = verify_popcorn_witness_evidence(
    response,
    jwks,
    expected_payload=exact_payload_bytes,
    expected_nonce=original_nonce,
    expected_previous_attestation=previous_compact_jws,
    max_clock_accuracy_radius_ms=10_000,
)
replay_key = verified["replay_key"]
```

The verifier returns the replay key; the participant remains responsible for
remembering accepted keys and applying its own idempotency policy.

The witness tests use the settled production packet in
`../test-vectors/popcorn-witness-receipt-v1.json` and independently reject its
published one-byte tamper case.
