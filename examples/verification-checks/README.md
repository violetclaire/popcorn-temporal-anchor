# Here’s my work. Here’s how to check it.

Run it yourself and see whether it does what I said.

From the repository root, with Node.js 20+:

```sh
node examples/verification-checks/check.mjs
```

No installation, wallet, payment, network request, or execution of a task is required.
The checker reads the repository's saved public receipts. Keep the repository's
`examples/task-schedule` and `examples/witness` directories when running it.
Every row prints input-case identity, expected result, computed result, and pass/fail.
A mismatch exits with code 1. Expected results are in `vectors.json`; `compute(input)`
does not receive them. Change an expected result and the comparison must fail.

## Engine, schema, data

- Engine: `verifier.mjs`, generated from the maintained TypeScript verifier and
  task-schedule evaluator. It contains the actual verification functions, not a
  second implementation written to match the tests.
- Schema: TASK-SCHEDULE/1.0 in `../../docs/task-schedule.txt`. Eight ordered,
  nonempty LF-terminated UTF-8 lines: need, who, yes_condition, boundary_utc,
  boundary_rule, expire_utc, on_yes, on_no. See that document for allowed values.
- Data: a synthetic eight-line schedule in `vectors.json`, plus original saved
  signed receipts. The August 31 artifact is separately checked as the original
  228-byte JSON schedule; it is not relabeled as the later eight-line schema.

## Rules tested

Malformed/non-finite intervals and established expiry return STOP. Non-boolean
conditions return STOP. A false condition returns on_no only after those checks.
Only true can reach REFETCH for uncertainty crossing expiry or a boundary.
PROCEED is a local policy result, not an issued authorization.

The tests also cover invalid UTF-8, BOM, extra/missing lines, CRLF, changed task
bytes, changed nonce, omitted bindings, altered signatures/scope, missing keys,
clock-radius policy, and repeated verification. Rechecking the same receipt is
allowed; duplicate execution prevention belongs to the executor.

The maintained verifier's broader tests include predecessor chains:

```sh
cd verify/typescript
npm run check
```

That developer command requires the package's development dependencies.

## Rebuild and inspect

With Node 22.13+ (build-time only), from the repository root:

```sh
node examples/verification-checks/build.mjs
```

This rebuilds the standalone module and the HF sample from maintained source.
`sources.json` records source and bundle SHA-256 values for comparison; it is not
an independent trust anchor. The generated HF sample remains witness-only: it
does not recompute the packet's historical temporal-policy claims. Those claims
must not be described as verified by that sample.

## What the result does not establish

Bundled historical keys support reproducibility, not independent issuer trust.
These checks do not establish current time, live settlement, consent, execution,
or agent behavior. Scope mutations in these vectors are post-signature mutations;
their rejection is not a separate demonstration against a malicious signer.
The receipt verifier's exact evidence-scope checks remain in the source.
No historical signed bytes are rewritten by the checker or build.
