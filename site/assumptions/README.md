# Assumptions

Live page: [767-2676.com/assumptions](https://767-2676.com/assumptions).

The page presents one computed result in human language and machine-readable bytes. It replays two authentic saved production witness records:

- [evaluation-packet.production.json](../../examples/witness/evaluation-packet.production.json): the checkpoint falls after the task window.
- [evaluation-packet.proceed-002.production.json](../../examples/witness/evaluation-packet.proceed-002.production.json): the whole witness interval falls inside the task window.

The original receipt signatures, task bytes, public keys and published one-byte task mutations are preserved. The signature control separately flips one signature byte. Published outcome labels are comparison metadata; they do not determine the computed result.

## Build and check

Use Node.js 24. From the repository root, run:

```sh
node --disable-warning=ExperimentalWarning site/assumptions/build-evidence.mjs
node site/assumptions/build-page.mjs
node --disable-warning=ExperimentalWarning site/assumptions/check-model.mjs
```

No dependency installation or network access is needed. Paths resolve from the scripts, so the working directory does not matter. Keep this directory at `site/assumptions`: the evidence build reads the two fixtures, `examples/witness/evaluation-outcomes.json` and `verify/typescript/src/index.ts` from the repository root.

The checker covers all eight control combinations, digest and signature failures, trusted versus untrusted timing, strict malformed inputs, equivalence to the maintained verifier, and agreement between the shared result, human presentation and rendered default JSON. `sources.json` records exact source and generated evidence-module hashes. Rebuild evidence before checking after source changes.

The browser uses Web Crypto and same-origin ES modules. Serve the files under `/assumptions/` over HTTPS or localhost; opening `index.html` directly with a file URL is not supported.

## Scope

These are historical local policy results. `TIME_CHECK_PASSED` is displayed as `PROCEED` only when the full verified witness interval lies inside the original task window. It does not establish current time, consent, authorization, execution or delivery. Archived keys support reproducible checks, not independent issuer trust. No task is executed and no payment is sent. The preserved licensing terms are in the repository's [LICENSE](../../LICENSE) and [LICENSING.md](../../LICENSING.md).
