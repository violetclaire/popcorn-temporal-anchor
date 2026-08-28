# Python verifier

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
