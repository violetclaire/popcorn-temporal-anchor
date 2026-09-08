# Sound clock front page

The front page of 767-2676.com is the sound clock: four questions in a phthalo-green and cream grid, with a separate tone for each heading.

| Field | Question | Frequency |
| --- | --- | --- |
| NEED | What has to happen? | 350 Hz |
| YES | What has to remain true for you to proceed? | 440 Hz |
| BOUNDARY | What turns YES into NO? | 480 Hz |
| TIME | When does that boundary occur? | 620 Hz |

Open `index.html` in a browser to review the standalone page. It includes its styles and audio code. Clicking or keyboard-activating a heading plays a sine wave for 1.2 seconds, with a soft attack and release. There is no autoplay. Each heading exposes the same integer in `data-frequency-hz`; agents can read the value without hearing audio.

The closing sentence is followed by two small links: agents · schedule.

## Publish with the existing service

Serve `index.html` at `/` through the current Cloudflare Worker. Preserve the current service routes, bindings, signing keys, and configuration. The GitHub source and the private Sites preview do not deploy the live Cloudflare domain automatically.

| File | Destination |
| --- | --- |
| index.html | / |
| tone-spec.v1.json | /tone-spec.v1.json |
| signal.md | /signal.md |
| pricing.html | /pricing |
| terms.html | /terms |
| llms-addendum.txt | Append to the existing /llms.txt; preserve its other content |

Keep /v1/time, /v1/receipt, /test-line, /schedule and its examples, /agents, /.well-known/popcorn-keys.json, the MCP installation material, and the other existing routes at their current locations.

The mapping is `767-2676-tone-plan` version `1.0.0`. A future frequency or mapping change requires a version bump. Keep the visible numbers, HTML attributes, JSON, and llms.txt mapping consistent.

Signal mappings belong in the documentation, not among the four front-page questions. Audio playback is a rendering of a published reference. It does not grant authorization or produce a signed time witness. See [signal.md](signal.md).

See [OPERATOR.md](../../OPERATOR.md) for the broader publishing instructions.

The hourly test automation is paused at the owner’s request. Keep the saved /test-line sample available, with no front-page link.

## Deployment record — 2026-09-08

Published to https://767-2676.com/ as Cloudflare Worker version `fb47ecb5-1626-43bb-b4e6-f321e239b512`. The root HTML was compared byte-for-byte with `index.html`. Pricing, service terms, tone documents, and the appended llms.txt were checked live. Both paid endpoints returned x402 v2 challenges for 1000 atomic USDC on Base. No payment was made during these checks. Existing bindings and configuration were preserved.

`llms.txt` is a snapshot of the complete published discovery document. Future updates should preserve its service and verification links. `patch-worker.mjs` records the checked transformation from the preceding live source; it deliberately refuses a source with changed anchors. Always download and inspect the current Worker before using it.

The directory reported its last site-pillar check at 2026-09-06T21:43:17.888Z. Root llms.txt was reachable before this release. Its response is now text/plain and the front page links to it in HTML metadata. The directory controls its next assessment and ranking.
