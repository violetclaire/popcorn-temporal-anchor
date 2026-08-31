# Portable schedule carrier

This example gives two isolated computers the same checkable task state without
sharing model memory or sending the schedule to POPCORN.

The producing client:

1. reads the exact schedule bytes from a local file or HTTPS URL;
2. keeps those bytes local and sends only their SHA-256 digest and a fresh nonce;
3. pays `POST /v1/receipt` through x402 v2, capped at `$0.001`;
4. captures the `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` headers;
5. fetches POPCORN's live JWKS and verifies the signed checkpoint;
6. compares the complete signed witness interval with `execution_window_utc`;
7. writes one portable outcome JSON file.

The second client does not trust the first client's written conclusion. It reads
the exact bytes from the outcome, recalculates their digest, fetches the live
public key, verifies the signature and nonce, and calculates the judgment again.

Judgments are deliberately narrow:

- `STOP`: the full witness interval is outside the task window;
- `TIME_CHECK_PASSED`: the full witness interval is inside the task window;
- `RECHECK`: clock uncertainty crosses a task-window boundary.

`TIME_CHECK_PASSED` is not permission to act. Every outcome says
`authorization_granted: false`. The agent or receiving system still applies its
own identity, permission, availability, price, and execution rules.

## Install and test without paying

```bash
npm install
npm run check
npm start -- --schedule ../../examples/witness/schedule.sample.json --dry-run
```

`--dry-run` reads and hashes the schedule but makes no network request and sends
no payment.

## Produce a new paid outcome

Set `EVM_PRIVATE_KEY` to a dedicated funded Base key in the local environment.
Never commit it. Then run:

```bash
npm start -- --schedule ./my-schedule.json --out ./portable-outcome.json
```

Or read exact bytes from a public HTTPS location:

```bash
npm start -- --schedule-url https://example.com/my-schedule.json --out ./portable-outcome.json
```

Paid mode refuses to run without `--out`, refuses to overwrite an existing
file, and caps the x402 payment at `$0.001`. Inspect the endpoint's current 402
challenge and use wallet-level controls before autonomous mainnet use.

The schedule itself is included in the portable outcome because the other
participant needs the exact bytes. Do not publish an outcome containing a
private schedule. POPCORN receives only the digest, but whichever normal web,
GitHub, A2A, or private transport carries the outcome will see its contents.

## Verify on a second computer

```bash
npm install
npm run verify -- --outcome ./portable-outcome.json
```

The outcome may also be fetched over HTTPS:

```bash
npm run verify -- --outcome https://example.com/portable-outcome.json
```

By default the verifier trusts only:

- service: `https://767-2676.com/v1/receipt`
- key set: `https://767-2676.com/.well-known/popcorn-keys.json`
- node: `767-2676.com`

For an offline test, save that JWKS separately and use `--jwks-file FILE`. A key
bundled inside an outcome is never treated as its own trust root.
