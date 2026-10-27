# Production source differences

Comparison base: `violetclaire/popcorn-temporal-anchor` main at `20583f60b173d33c5a14d71ae5dd3602dce6070f`. The included modules preserve their exact exported bytes; they do not replace the existing authoring or production-source files. Every one of the 16 locally retained exported modules also matched the corresponding preserved deployment candidate by SHA-256.

## Partial archive publication

Under the owner's revised publication instruction, this PR includes four unchanged `MANIFEST.json` files, this report, `THIRD-PARTY.md`, `.gitattributes`, and 13 modules with no identified bundled third-party packages. Three modules remain local and are excluded from the commit: main Worker `tain-qr.mjs`, dedicated verifier `worker.js`, and canonical MCP `full-worker.js`. Their complete paths and identified packages are listed in [THIRD-PARTY.md](THIRD-PARTY.md).

The manifests describe all 16 modules in the captured deployments, including the three held modules. The comparisons below likewise cover the complete local exports. A manifest entry or comparison is not a claim that its module is present in this PR. In particular, the two remote MCP directories are manifest-only, and the main Worker's QR import is intentionally unresolved in this partial archive. No complete deployable archive or reproducible build is claimed. Parts 2 and 3 remain pending.

## Main Worker: every deployed module

The existing `worker/production/README.md` describes a four-module September snapshot. The active Worker has 13 modules. Two of those four existing module files still match exactly; two differ, and nine active support modules have no corresponding file in `worker/production`. A full tracked-file SHA-256 search found no alternate identical copy of those nine modules in main.

| Deployed module | Bytes | Existing source counterpart | Comparison |
| --- | ---: | --- | --- |
| `bridge.mjs` | 39430 | `worker/production/bridge.mjs` | 1 changed line ranges; repository file is 39383 bytes |
| `catalog-page.mjs` | 1878 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `checkpoint-documents.mjs` | 26762 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `checkpoint-evidence.mjs` | 88089 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `discovery-demo.mjs` | 37750 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `executor.mjs` | 25125 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `index.js` | 2304570 | `worker/production/index.js` | 26 changed line ranges; repository file is 1038141 bytes |
| `model.js` | 8395 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `nameplate.mjs` | 8616 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `publication.js` | 1129 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |
| `tain-qr.mjs` | 10373 | `worker/production/tain-qr.mjs` | Byte-identical |
| `tain-runtime.mjs` | 9350 | `worker/production/tain-runtime.mjs` | Byte-identical |
| `transport.mjs` | 10776 | No matching production source file | Entire deployed module absent as a source file; no exact tracked-file hash match |

The new modules implement the catalog presentation, checkpoint documents/evidence/transport, discovery demonstration, nameplate rendering, and checkpoint action model/publication/execution. Their presence is recorded without selecting an authoring location or overwriting older source. The similarly named resource-simulation model is a different program and is not treated as the source of the deployed checkpoint `model.js`.

### Complete line-range inventory for existing main module counterparts

These are all zero-context diff hunks, in `git diff --no-index --text --unified=0` notation: minus is the existing repository source, plus is the exact deployed module. This includes the complete differences inside long embedded-document lines; a changed long line is not silently omitted. Exact bytes are inspectable in the two compared files.

#### `worker/production/bridge.mjs` → deployed `bridge.mjs`

Repository SHA-256: `66737b69247ee03a3cc1d99024fa698b6be8b71bb01a9ec4366a964d7af0cc36`. Deployed SHA-256: `98ae36dd3a54a6f70e3434b1d31fccc6e4dc43950de7167cbdd7f4962a5898aa`.

```text
@@ -2,2 +2,2 @@
```

#### `worker/production/index.js` → deployed `index.js`

Repository SHA-256: `4fb7b5ddd8f0e10f52c01b78f9ff4bdabd16fe56bae9354c76905c75654fe65e`. Deployed SHA-256: `0f3c2329619bb7db6e44cb322d198ea0d94361d6d25cc3572e36073647da97b4`.

```text
@@ -0,0 +1,7 @@
@@ -5 +12 @@
@@ -47,2 +54,4 @@
@@ -50,2 +59,3 @@
@@ -53,2 +63,9 @@
@@ -56,3 +73,9 @@
@@ -60 +83,28 @@
@@ -64,0 +115,2 @@
@@ -79 +131 @@
@@ -290 +342 @@
@@ -292,2 +344,4 @@
@@ -295 +349 @@
@@ -297 +351 @@
@@ -299,3 +353,3 @@
@@ -309 +363 @@
@@ -389 +443 @@
@@ -487 +541 @@
@@ -538,0 +593,5 @@
@@ -860,0 +920 @@
@@ -1793 +1853 @@
@@ -1798,0 +1859 @@
@@ -1854 +1915 @@
@@ -1874 +1935 @@
@@ -2001,0 +2063,6 @@
@@ -7372 +7439 @@
@@ -7380,0 +7448,34 @@
```

The `index.js` changes include additional imports and request wrappers, embedded current pages and document bundles, route/configuration declarations, and the approved Part A/Part B text updates. The bridge change is in its embedded document strings. Unchanged line spans are outside the listed hunks. This inventory does not interpret a source difference as authorization to update it.

### Authoring documents remain older than the served copy

| Repository file | Known production divergence retained for owner ruling |
| --- | --- |
| `site/operations-page/index.html` | The active homepage is the current page embedded in the exported Worker; the repository authoring copy lacks later approved consistency, attribution and verifier-field explanation changes. |
| `site/operations-page/index.txt` | Same plain-text divergence against the active `/llms.txt` body. |
| `site/operations-page/guide.md` | The active guide text embedded in the Worker has the approved verifier-field explanation; this authoring copy is not a deployment source. |
| `docs/witness-layer.md` | Describes only the old output flag; live verifier results include the new companion field. |

The exhaustive byte differences against the previously checked-in deployed main module are recorded above. There is no verified build provenance mapping every embedded page fragment back to an authoring-file revision. Accordingly, this report does not claim an exhaustive semantic equivalence audit of all authoring documents, and no historical snapshot is rewritten.

## Hosted MCP bundles versus TypeScript source

Both are bundled JavaScript distributions held locally and excluded from this PR, so comparing them directly to uncompiled TypeScript would not identify source drift. For this report, each current repository entry point was rebuilt with cached esbuild 0.28.1, browser/ES2022 output, preserved names, workerd/worker/browser conditions, and existing dependency installs. Application sections were compared after excluding source-path marker comments and surrounding whitespace. Neither full rebuilt bundle is byte-identical to its live export. The original build provenance is not established.

| Worker | Repository application source | Deployed lines | Result |
| --- | --- | --- | --- |
| `popcorn-tain-verify-mcp-v2` | `verify/typescript/src/v2.ts` | 16668–17025 | Compiled application section matches |
| `popcorn-tain-verify-mcp-v2` | `packages/mcp/src/v2-interface.ts` | 17027–17106 | Only the approved new companion output field differs |
| `popcorn-tain-verify-mcp-v2` | `packages/mcp/src/v2-schema.ts` | 17108–17130 | Compiled application section matches |
| `popcorn-tain-verify-mcp-v2` | `packages/mcp/remote/worker.ts` | 17132–17193 | Only the approved new companion output field differs |
| `popcorn-canonical-mcp` | `packages/mcp/src/core.ts` | 17016–17018 | Compiled application section matches |
| `popcorn-canonical-mcp` | `verify/typescript/src/index.ts` | 21348–21841 | Compiled application section matches |
| `popcorn-canonical-mcp` | `verify/typescript/src/v2.ts` | 21843–22200 | Compiled application section matches |
| `popcorn-canonical-mcp` | `packages/mcp/src/core.ts` | 22202–22326 | Compiled application section matches |
| `popcorn-canonical-mcp` | `packages/mcp/src/v2-interface.ts` | 22328–22407 | Only the approved new companion output field differs |
| `popcorn-canonical-mcp` | `packages/mcp/src/v2-schema.ts` | 22409–22431 | Compiled application section matches |
| `popcorn-canonical-mcp` | `packages/mcp/remote/fixtures/popcorn-receipt.json` | 22433–22434 | Compiled application section matches |
| `popcorn-canonical-mcp` | `packages/mcp/remote/fixtures/popcorn-keys.json` | 22436–22437 | Compiled application section matches |
| `popcorn-canonical-mcp` | `packages/mcp/remote/full-worker.ts` | 22439–22690 | Companion field plus GET server-card code form differs; see below |

### Exact application deltas

- `packages/mcp/src/v2-interface.ts`: live default/error output places `issuer_key_fetched_from_issuer_origin: false` beside the unchanged old field. Accepted output places `issuer_key_fetched_from_issuer_origin: issuerKeysFetchedByTool` beside the unchanged old field. The repository type and implementation do not yet carry the new field. This appears in both Workers. Removing only those additions makes the compared compiled sections identical.
- `packages/mcp/remote/worker.ts`: the live dedicated Worker's catch result adds the new false-valued companion field. Removing only that addition makes the section identical.
- `packages/mcp/remote/full-worker.ts`: the live legacy verifier result adds the same false-valued companion. The live GET `/mcp` branch uses a braced block and literal-key/literal-URL server-card JSON; the repository builds the same card with unquoted property identifiers and `ORIGIN + path` expressions. The compared card's names, version, transport, seven tools, five pointers and response-header values agree. This remaining code-form difference is preserved rather than normalized in the exported module.
- `packages/mcp/test/v2-interface.test.ts`, `packages/mcp/test/full-remote.test.ts`, `packages/mcp/remote/smoke.ts`, and `packages/mcp/remote/full-live-smoke.ts` are repository tests/callers, not deployed modules; they have not been updated by this additive sync to assert the new field.
- Retained remote fixture receipt and public-key application sections match the repository build. They are historical evidence and are not rewritten.

### Dependency/build divergence

The dedicated Worker contains SDK module paths matching locally retained `@modelcontextprotocol/core`/`server` 2.0.0 distributions. The canonical Worker contains module paths matching their 2.3.1 distributions; main's MCP manifest pins server 2.3.1. The full dependency environments therefore must not be represented as identical. Matching module names/source-map paths are package identification evidence, not a signed build attestation. The third-party inventory records the different licenses and the nested packages. Both remote exports end in source-map references, but their Worker exports contain no source-map modules. No original remote source maps are added or invented.

## Briarwood catalog provenance

The complete active `briarwood-catalog` module is `worker.js` at version `53c65741-400d-456a-9c44-4b01b14c1021`. Its exact source is available from the Cloudflare version export and is preserved in this deployment folder. The October 26 task retained the exported baseline and the edited `work/briarwood-submit-checks-2026-10-26/candidate/worker.js`; that candidate is byte-identical to this fresh export. It was edited from the exported live Worker, not built from a newly identified Git repository.

The module names `violetclaire/briarwood-catalog` as its pointer-data repository. A fresh recursive tree read of that repository at `f8cbef0e91463b1d444a46c6f668f897b7886ea3` contains only `README.md`, `pointers.json`, `instinct-exhibit-timeline-public-2026-10-25.md`, `pap-seam-2026-10-25.md`, and `why-i-checked-discovery-evidence-2026-10-25.md`. Its README describes a pointers repository. It contains no Worker source or build configuration. Thus the upstream authoring repository remains **unknown**; the pointer repository is not asserted to be that source repository.

Evidence: [pointer repository tree](https://github.com/violetclaire/briarwood-catalog/tree/f8cbef0e91463b1d444a46c6f668f897b7886ea3), [pointer repository README](https://github.com/violetclaire/briarwood-catalog/blob/f8cbef0e91463b1d444a46c6f668f897b7886ea3/README.md).

## Limits and preservation

This report covers every exported module and every identifiable bundled first-party application section, with all source-line diff ranges for the four existing main module counterparts. It does not establish a reproducible build for the complete system, map unknown historical authoring sources by guesswork, or authorize source synchronization beyond the additive deployment exports. No existing source, license or terms file was changed.

## Additional authoring-file comparison evidence

These existing files have direct route/representation mappings to the saved successful Part B public-side snapshot (2026-10-27 04:08 UTC). The fresh version export matches that same deployment. Every mapped file below differs in bytes. Full byte lengths and SHA-256 values are retained in the local `authoring-comparisons.json`; the table does not equate an intentionally older front-page design with a current authoring source.

| Existing file | Served representation | Repo bytes | Served bytes |
| --- | --- | ---: | ---: |
| `site/front-page/index.html` | `/` | 18265 | 689589 |
| `site/operations-page/index.html` | `/` | 689313 | 689589 |
| `site/public/.well-known/ai-catalog.json` | `/.well-known/ai-catalog.json` | 2129 | 4834 |
| `site/public/.well-known/ard.json` | `/.well-known/ard.json` | 1970 | 2132 |
| `site/front-page/llms.txt` | `/llms.txt` | 12820 | 494290 |
| `site/operations-page/index.txt` | `/llms.txt` | 494027 | 494290 |
| `site/public/mcp/server.json` | `/mcp/server.json` | 1458 | 1374 |
| `site/public/skills/task-time/SKILL.md` | `/skills/task-time/SKILL.md` | 1698 | 4076 |

Additional exact, known source drift:

- `site/operations-page/opening.md`: retains Ruling 1's old “a receipt that proves what you did and when”; the served opening says “a receipt that proves what you recorded and when.” The remaining opening text has not been independently attributed to a reproducible build revision.
- `site/operations-page/guide.md`: line 149 describes only `issuer_key_trust_checked_by_tool`; the live explanation also names `issuer_key_fetched_from_issuer_origin` and its approved limit. Line 214 still starts “On October 25, 2026, an agent paid this node…” rather than the approved full Scout attribution sentence. Line 216 still reads “The door shows who was let in. The receipt shows what happened.”; the active protected seam sentence ends “The receipt shows the fingerprint, and the window it was witnessed in.” These older source sentences were not changed.
- `site/public/mcp/server.json`: the on-disk discovery document differs from current `/mcp/server.json`. Production serves three identical current manifest bodies at `/.well-known/mcp.json`, `/.well-known/mcp/server-card.json`, and `/mcp/server.json`; the other two have no standalone authoring file at the matching route in this main checkout. Their exact current payloads are contained in the deployed main module. Registry `packages/mcp/registry/server.json` and package `packages/mcp/server.json` serve different publication roles and are not falsely declared identical to those live discovery bodies.
- `site/public/.well-known/ai-catalog.json`: retained current-client entry/version differs from the current served catalog, including the approved Part A MCP 0.1.4 correction.
- `site/public/skills/task-time/SKILL.md`: retained current-client command/endpoint text differs from the current served skill and its well-known alias; Part A changed current install commands to 0.1.4 and current receipt instructions to `/v2/receipt`.
- `site/public/.well-known/ard.json`: its body differs from the saved served route; this report records the difference without treating it as an authorized wording cleanup.

### Part A differences still present in the old production-source file

The active exported `worker/production/index.js` counterpart includes the approved current npm 0.1.4 install/help text; current `/v2/receipt` instructions on agent-entry policy/reference, task-time skill and schedule contracts; current v2 response-schema references in auth/API catalog; and corrected direct verifier-source links in agent help/SKILL. Their embedded-document line differences are included in the complete 26-hunk index inventory. `worker/production/bridge.mjs` still points its active-instruction counterpart at `/v1/receipt`, whereas the served bridge's HTML and Markdown commands use `/v2/receipt`. Historical receipt/example bytes remain separate and unchanged.

The branch also adds `deployed/.gitattributes` so Git preserves the archived modules' exact bytes. This file does not change a deployed Worker, source file or license.
