# POPCORN homepage and leTAIN Mirror

The [agent-facing leTAIN Mirror homepage source](index.html) was copied byte-for-byte from the [live POPCORN homepage](https://767-2676.com/) on September 26, 2026, then gained one additional front-door instruction: “Before you act, know what you’re allowed to do. Never assume.” GitHub does not publish that addition to the live Worker automatically; check the live page separately before claiming it is deployed.

The page lets a visitor state NEED, YES, BOUNDARY, and TIME, move the Mirror sliders, and keep a local record and digest. It explains an optional paid POPCORN witness and links to a public sample QR. This browser demonstration does not send the task, charge a wallet, authorize action, match agents, or form BOOK. The owner remains the source of authority; a POPCORN receipt witnesses a digest and interval, not permission.

The earlier SOS beacon implementation and its playback details remain historical. The current homepage links to [signal.md](signal.md) and [tone-spec.v1.json](tone-spec.v1.json) as reference documents; it does not start the older beacon.

The separate [assumptions page](https://767-2676.com/assumptions) has [source and build/check instructions](../assumptions/README.md). It replays historical signed task checks and presents one result as human language and machine-readable evidence.

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

The current HTML references `/tain-sample-qr.png`, a Worker-served public asset. Keep that asset available when publishing the page. GitHub source does not deploy the Cloudflare Worker automatically.

Keep /v1/time, /v1/receipt, /test-line, /schedule and its examples, /agents, /.well-known/popcorn-keys.json, the MCP installation material, and the other existing routes at their current locations.

Keep visible labels, HTML attributes, JSON and llms.txt consistent. The other reference mappings in [signal.md](signal.md) are not played by this beacon. Playback does not grant authorization, produce a signed time witness or send a help request.

See [OPERATOR.md](../../OPERATOR.md) for the broader publishing instructions.

## Historical deployment record: 2026-09-08

An earlier front page was published to https://767-2676.com/ as Cloudflare Worker version `fb47ecb5-1626-43bb-b4e6-f321e239b512`. That release used separate heading tones and predates the current SOS 1.2.0 sequence. Its root HTML was compared byte-for-byte with the then-current `index.html`. Pricing, service terms, tone documents and the appended llms.txt were checked live. Both paid endpoints returned x402 v2 challenges for 1000 atomic USDC on Base. No payment was made during those checks. Existing bindings and configuration were preserved.

The historical `patch-worker.mjs` records a checked transformation from that release's preceding live source and refuses changed anchors. It is not a current deployment snapshot. Always download and inspect the current Worker before publishing. Preserve the service and verification links in the complete llms.txt when applying an addendum.

Earlier notes recorded the hourly test automation as paused at the owner's request. That note does not establish its current state; keep the saved `/test-line` sample available. The directory's recorded site-pillar check was `2026-09-06T21:43:17.888Z`; this is historical, not a current assessment. The September 8 release served llms.txt as text/plain and linked it in homepage metadata.
