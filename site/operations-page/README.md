# POPCORN operations homepage

`index.html` is the complete compiled deliverable for the canonical `https://767-2676.com/` homepage. It begins with the owner's authored second-person opening, followed by the operations guide and reference material compiled from 69 public source documents collected on October 20, 2026. `index.txt` serves the same document as plain text at `/llms.txt`. All text is present in each response; no additional fetch or JavaScript execution is needed to read it.

The page is read-only, with no links, buttons, scripts, forms, navigation controls, or collapsed content. Addresses are printed as text. The existing homepage wording, `True Witness Here` nameplate, ratified leTAIN definition, canonical TAIN passage, and canonical Discovery passage are preserved. Historical evidence retains its original meaning and bytes at its original endpoints.

## Files and maintenance

- `index.html`: the full page to retain in the repository and deploy; it is not a partial template.
- `index.txt`: the complete plain-text counterpart, generated from the visible HTML document.
- `opening.md`: the owner's opening prose and section order; pasted Markdown artifacts were removed and addresses rendered as plain text.
- `guide.md`: the editable operational summary included in the page.
- `sources.json`: source URLs, HTTP status, title, media type, byte count, and SHA-256 of the collected source bytes. It contains no local filesystem paths. Source hashes describe the original fetched documents, not the reformatted HTML excerpts.
- `patch-worker.mjs`: exports `patchHomepage(before, html, plain)` for the homepage and plain-text presentation change.

Apply the patch to the **exact authenticated active Worker source**, after verifying the active deployment has not changed. Do not replace production with an older repository snapshot. The patch requires the expected presentation wrapper, changes only canonical `/` and `/llms.txt`, and asserts that restoring the prior presentation branch reproduces the original source exactly. Keep all companion modules and deployment settings unchanged. Other routes, receipt issuance, payment rules, verifier, keys, catalogs, and historical records are outside this change.

When updating the guide or collected references, rebuild and inspect the complete `index.html`, preserve the locked wording, and repeat the read-only markup and root-only patch checks. Fetch public source bytes without coercing binary response buffers to decimal-number strings. Saved key/status snapshots must remain labeled as snapshots rather than current trust or time.

## Validation

The current candidate passed **23 tests, 0 failures**, including exact HTML/plain-text GET and HEAD responses, unsupported methods, canonical redirects, unchanged routes, and production receipt behavior. Tests used a scratch documentation fixture aligned to current production text from `/agents.md`. The old `/llms.txt` section assertion was replaced with exact full-document checks for its authorized replacement; the other four documentation routes and source-updater checks remain intact. Repository test sources were not changed.

The repository fixture predates an approved production wording correction in its receipt-verification introduction. Against the unmodified active Worker, that stale fixture already failed the documentation updater's idempotence check. Replacing only the scratch fixture with the exact active text made the baseline's 17 existing tests pass; the same alignment was used for the candidate's 21-test run. This avoids reverting current production wording merely to satisfy an outdated fixture.

## Published release

Current release: version `939107ae-8e5d-4f69-9651-d2ece146ca7c` publishes the complete owner-authored opening from “You wake up...” through “The record shows.” beneath the existing header. Live HTML SHA-256 `3a2cc19e59c6f18a400a34f3e7b968bb10e63ba14e10d6d1fab0116f41296cd2` (566,418 bytes); live plain-text SHA-256 `679faa09e412b4c6e26ef3591eb6dd0f3b6fd6d867b55844d331ae6e0e98e4ba` (441,400 bytes). Both live bodies and empty HEAD responses matched. Eleven other checked routes remained byte-identical; the live homepage had zero clickable elements.

Opening revision: the original Discovery paragraph now appears immediately beneath `True Witness Here`, beginning “Agents wake up on a borrowed computer that can be wiped hourly.” The opening Briarwood/Violet credit was removed at the user's request. Published as version `02a464c9-a5b4-45c7-ad11-802272dbe3f5`; root SHA-256 `0b53b9049ab72c67a46bcecee3ce067b99f7bfcf1a82700e0fe3961cef2b6af7` (561,853 bytes). All 21 checks passed again, live browser confirmed the opening order and zero clickable elements, and the twelve checked non-root responses remained byte-identical.

Published October 20, 2026 as Worker version `79962534-7541-4cd9-9ba8-12e268061341`, replacing `ec457c7a-a921-4186-869f-f5f236d6cefb`. Live root SHA-256: `587ee05bc2132b8e9c5f036f648a24e1d881456baebd81d7381ee0a3f4cfd0d2` (561,862 bytes). Twelve checked public service/document routes retained their exact response bodies; all twelve companion modules, settings, bindings, and signed checkpoint bytes were preserved. No paid request was made. The hourly publisher remains paused with its prior guard and baseline unchanged.

The live browser had zero clickable elements and no horizontal overflow at a 319-pixel viewport. Cloudflare's existing analytics injection can add its beacon element at the edge; the document's content security policy disallows script execution. Reading the page does not depend on that script or any other client-side execution.
