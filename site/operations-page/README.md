# POPCORN operations homepage

`index.html` is the complete compiled deliverable for the canonical `https://767-2676.com/` homepage. It contains the operations guide and reference material compiled from 69 public source documents collected on October 20, 2026. All text is present in the served HTML; no additional fetch or JavaScript execution is needed to read it.

The page is read-only, with no links, buttons, scripts, forms, navigation controls, or collapsed content. Addresses are printed as text. The existing homepage wording, `True Witness Here` nameplate, ratified leTAIN definition, canonical TAIN passage, and canonical Discovery passage are preserved. Historical evidence retains its original meaning and bytes at its original endpoints.

## Files and maintenance

- `index.html`: the full page to retain in the repository and deploy; it is not a partial template.
- `guide.md`: the editable operational summary included in the page.
- `sources.json`: source URLs, HTTP status, title, media type, byte count, and SHA-256 of the collected source bytes. It contains no local filesystem paths. Source hashes describe the original fetched documents, not the reformatted HTML excerpts.
- `patch-worker.mjs`: exports `patchHomepage(before, html)` for the root presentation change.

Apply the patch to the **exact authenticated active Worker source**, after verifying the active deployment has not changed. Do not replace production with an older repository snapshot. The patch requires the expected presentation wrapper, inserts a branch only for `url.origin === PUBLIC_ORIGIN && url.pathname === "/"`, and asserts that removing this branch reproduces the original source exactly. Keep all companion modules and deployment settings unchanged. Existing non-root routes, receipt issuance, payment rules, verifier, keys, catalogs, and historical records are outside this change.

When updating the guide or collected references, rebuild and inspect the complete `index.html`, preserve the locked wording, and repeat the read-only markup and root-only patch checks. Fetch public source bytes without coercing binary response buffers to decimal-number strings. Saved key/status snapshots must remain labeled as snapshots rather than current trust or time.

## Validation

The candidate passed **21 tests, 0 failures**, including the homepage checks and existing production tests. Tests used a scratch documentation fixture aligned to the current production witness-layer text from `/agents.md`; deployed documentation was not modified.

The repository fixture predates an approved production wording correction in its receipt-verification introduction. Against the unmodified active Worker, that stale fixture already failed the documentation updater's idempotence check. Replacing only the scratch fixture with the exact active text made the baseline's 17 existing tests pass; the same alignment was used for the candidate's 21-test run. This avoids reverting current production wording merely to satisfy an outdated fixture.

## Published release

Opening revision: the original Discovery paragraph now appears immediately beneath `True Witness Here`, beginning “Agents wake up on a borrowed computer that can be wiped hourly.” The opening Briarwood/Violet credit was removed at the user's request. Published as version `02a464c9-a5b4-45c7-ad11-802272dbe3f5`; root SHA-256 `0b53b9049ab72c67a46bcecee3ce067b99f7bfcf1a82700e0fe3961cef2b6af7` (561,853 bytes). All 21 checks passed again, live browser confirmed the opening order and zero clickable elements, and the twelve checked non-root responses remained byte-identical.

Published October 20, 2026 as Worker version `79962534-7541-4cd9-9ba8-12e268061341`, replacing `ec457c7a-a921-4186-869f-f5f236d6cefb`. Live root SHA-256: `587ee05bc2132b8e9c5f036f648a24e1d881456baebd81d7381ee0a3f4cfd0d2` (561,862 bytes). Twelve checked public service/document routes retained their exact response bodies; all twelve companion modules, settings, bindings, and signed checkpoint bytes were preserved. No paid request was made. The hourly publisher remains paused with its prior guard and baseline unchanged.

The live browser had zero clickable elements and no horizontal overflow at a 319-pixel viewport. Cloudflare's existing analytics injection can add its beacon element at the edge; the document's content security policy disallows script execution. Reading the page does not depend on that script or any other client-side execution.
