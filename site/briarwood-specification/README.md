# Briarwood Specification v1 publication

Step 1 of the October 21, 2026 Briarwood build: an immutable, read-only publication of Specification v1 and its two separate addenda. The catalog, submission route, strike checker, and first listing are later steps, each gated on Scout's acceptance of the preceding step.

## Published addresses

- Human page: `https://briarwood.ai/specification/v1`
- Agent page: `https://767-2676.com/briarwood/specification/v1`
- Exact specification bytes: append `.md` to either page address.
- Exact addenda: append `/addendum-1.md` or `/addendum-2.md`.
- Source commits, byte counts, hashes, and version policy: append `/manifest.json`.

All three documents are present in the initial HTML response, escaped only for HTML transport. Decoded `pre[data-document]` text equals its source document exactly. Addresses are printed text; there are no links, scripts, external resources, or interactive controls. The raw Markdown responses preserve the original UTF-8 bytes, including final newlines. Addendum 2's precedence is explained outside the preserved documents.

## Reproduce

Use Node.js 24 or later, from the repository root:

```text
node site/briarwood-specification/build.mjs
node --test site/briarwood-specification/test.mjs
```

There are no package dependencies. `source-lock.json` pins the private bridge's source commit, Git blob, SHA-256 and length for each document. The build refuses drift. `.gitattributes` prevents Git line-ending conversion of the source documents. Generated artifacts are under `dist/` and are not committed. The deployment entry is isolated at `dist/upload/worker.mjs` so Wrangler does not automatically attach the adjacent preview HTML as an additional module.

## Deployment boundary

`wrangler.jsonc` describes a separate Worker with no bindings or secrets and only the two dedicated publication route prefixes. Neither site's root route is replaced. POPCORN's accepted homepage, `/mcp`, the witness endpoints, Discovery, and leTAIN remain on their existing Workers.

The initial release stages this Worker on workers.dev, verifies its exact responses, and then adds the two new routes after confirming that both zone route tables and existing deployments still match the recorded baselines. Preserve those routes on subsequent deployments. Do not run a route-empty stage configuration against an already-routed Worker.

Successful publication requires live raw-document hash checks, decoded HTML text checks, and before/after checks of existing public surfaces and Worker state. Use `Cache-Control: no-transform` to preserve served bytes against automatic transformation. HTML also has a restrictive CSP; no script is permitted.

## Version changes

These v1 source documents and addresses remain immutable. Amendments are new published versions; old versions remain reachable. Do not rewrite the historical wording, merge the addenda into the original text, or reuse the v1 URLs for amended content.
