# Foyer: mirror → clock → rooms

Two self-contained pages adapted from the public artifacts supplied in the
September 21, 2026 brief:

| Page | Public source | New route |
| --- | --- | --- |
| CDI mirror | https://muse.ai/s/cdi-slider-fq5xxlxjfxjxc4t | `/mirror` |
| With and Without POPCORN | https://muse.ai/s/with-and-without-popcorn-xme5xxxzkxkdyxwe | `/with-and-without-popcorn` |

The attached QR codes decode to these same two source URLs. The original artifact
HTML is retained in `sources/` for copy and behavior comparison; those source
snapshots are not part of the publishing route map.

The homepage introduces the mirror first, then the comparison. The mirror's next
link opens the comparison; the comparison's next link returns to `/#rooms`, where
the existing six-line invitation and beacon continue unchanged.

## Copy decisions required by the brief

The source mirror differs from the brief's stated labels. The brief takes
precedence for these two axes:

- Code: **Open / License what you built / Closed**. The axis is reversed relative
  to the source so Open selects the original open-source consequences and Closed
  selects the original limited-permission consequences.
- Collaboration: **Alone / With us / Merged**. These select the source's separate,
  narrow-test, and build-together states, respectively. The original explanations
  and all nine combined-position statements remain verbatim; the Merged label
  does not add a claim of legal merger or transfer of ownership.

The comparison retains its original copy and adds the brief's exact receipt-limit
sentence. No person's name is added to either page.

## Build and check

Requires Node.js 20 or newer. No package installation or network access is needed:

```sh
node site/foyer/build.mjs
node site/foyer/check.mjs
```

`build.mjs` derives the pages from the captured originals and `skin.css`, removes
remote font imports, embeds the styling, and hashes the exact inline scripts and
styles into each page's Content Security Policy. Unexpected source changes stop
the build rather than silently dropping copy.

The checks compare source prose and all nine consequence combinations, including
the reversed licensing axis. They recompute the Friday and Saturday fingerprints
with Node's independent SHA-256 implementation, exercise browser Web Crypto logic,
force out-of-order completions, and check unavailable/rejected crypto behavior.
They verify CSP hashes, the absence of network/storage APIs, the foyer order, and
static routing without contacting a production endpoint.

These automated checks do not substitute for a rendered mobile/desktop review.
Visual review could not be completed in the task environment: its browser does
not allow local-file previews. Check 390px and desktop widths before publishing.

## Privacy and behavior

Both delivered pages contain their own styles and scripts and use system fonts.
There are no forms, external resources, requests, telemetry, storage APIs, or
embedded third-party pages. All interaction state lasts only in page memory.
The CSP permits only the exact inline script/style hashes and a data favicon;
connections, fonts, workers, frames, objects, forms, and base-URL changes are
disabled. Outgoing navigation sends no referrer and carries no input state.

The hash demo computes SHA-256 using `crypto.subtle.digest` in the visitor's
browser. It never requests a receipt or calls POPCORN. A slower old calculation
cannot overwrite the selected version. Browser support errors are shown without
inventing a fingerprint.

Serve over HTTPS. Normal hosting access logs for page delivery are outside this
client-side guarantee; visitor interaction values never enter a request.

## Publish through the existing Cloudflare Worker

GitHub changes do not publish 767-2676.com. Use the existing Worker; do not replace
the service with a new static site. Retrieve and inspect its current deployed
source and retain a backup, settings, bindings, signing keys, and configuration.

| File | Route |
| --- | --- |
| `site/front-page/index.html` | `/` |
| `site/foyer/mirror.html` | `/mirror` and `/mirror/` |
| `site/foyer/with-and-without-popcorn.html` | `/with-and-without-popcorn` and `/with-and-without-popcorn/` |

For the documented bundled Worker route shape, a checked insertion is available:

```sh
node site/foyer/patch-worker.mjs current-worker.mjs patched-worker.mjs
```

It refuses an absent/ambiguous root-route anchor, a previously installed foyer,
missing HTML, and output-file overwrite. It proves that removing its insertion
restores the original Worker exactly. All existing service routes fall through
unchanged. It is a deployment aid, not a retrieved current deployment snapshot.

Inspect the resulting diff and deploy with the existing configuration. Do not
probe paid endpoints as part of this change. The homepage retrieved September 21
contained an injected Cloudflare analytics tag, absent from repository source;
the existing CSP blocks it. The new pages' exact script hashes likewise block
host-injected scripts. Verify that hosting does not relax either page's CSP and
that no analytics execute.

After deployment, compare all three HTML responses against these files, exercise
both sliders and the Friday/Saturday switch at desktop and mobile widths, and
confirm no additional network requests or persistent state during interaction.
Cloudflare dashboard access was blocked by its security verification in the task
browser; this branch is not evidence of a production deployment.
