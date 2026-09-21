# POPCORN homepage and SOS beacon

The [POPCORN homepage source](index.html) begins with the foyer: CDI mirror, then
With and Without POPCORN, then the rooms. See [foyer sources and publishing
instructions](../foyer/README.md). Its six-line invitation remains above the
four-question grid. The panels form four phases of one repeating SOS beacon under
`767-2676-tone-plan` version `1.2.0`.

| Phase | Question | Beacon output |
| --- | --- | --- |
| NEED | What has to happen? | Three dots at 350 Hz |
| YES | What has to remain true for you to proceed? | Three dashes at 440 Hz |
| BOUNDARY | What turns YES into NO? | Three dots at 480 Hz |
| TIME | When does that boundary occur? | Silence; 620 Hz is a readable reference only |

Start beacon begins the sequence; there is no autoplay. Dots last 120 ms, dashes 360 ms, and element gaps 120 ms, with no inter-letter gaps. TIME supplies the final 840 ms of silence, making a 3600 ms cycle. Sine-wave pulses use an 8 ms attack and 15 ms release. Stop beacon or hiding the page ends playback. Optional vibration follows the pulse timing where supported; it does not confirm physical output.

The page includes its styles, score and playback code. Visible labels, phase attributes and embedded JSON expose the sequence without audio. TIME has no pulses and its played `frequencyHz` is `null`. See [signal.md](signal.md) for phase intervals, accessibility and browser timing limits, and [tone-spec.v1.json](tone-spec.v1.json) for the versioned specification. Changes to timing or frequency mapping require a version update.

The separate [assumptions page](https://767-2676.com/assumptions) has [source and build/check instructions](../assumptions/README.md). It replays historical signed task checks and presents one result as human language and machine-readable evidence.

## Publish with the existing service

Serve `index.html` at `/` through the current Cloudflare Worker. Preserve the current service routes, bindings, signing keys, and configuration. The GitHub source and the private Sites preview do not deploy the live Cloudflare domain automatically.

| File | Destination |
| --- | --- |
| index.html | / |
| ../foyer/mirror.html | /mirror and /mirror/ |
| ../foyer/with-and-without-popcorn.html | /with-and-without-popcorn and /with-and-without-popcorn/ |
| tone-spec.v1.json | /tone-spec.v1.json |
| signal.md | /signal.md |
| pricing.html | /pricing |
| terms.html | /terms |
| llms-addendum.txt | Append to the existing /llms.txt; preserve its other content |

Keep /v1/time, /v1/receipt, /test-line, /schedule and its examples, /agents, /.well-known/popcorn-keys.json, the MCP installation material, and the other existing routes at their current locations.

Keep visible labels, HTML attributes, JSON and llms.txt consistent. The other reference mappings in [signal.md](signal.md) are not played by this beacon. Playback does not grant authorization, produce a signed time witness or send a help request.

See [OPERATOR.md](../../OPERATOR.md) for the broader publishing instructions.

## Historical deployment record: 2026-09-08

An earlier front page was published to https://767-2676.com/ as Cloudflare Worker version `fb47ecb5-1626-43bb-b4e6-f321e239b512`. That release used separate heading tones and predates the current SOS 1.2.0 sequence. Its root HTML was compared byte-for-byte with the then-current `index.html`. Pricing, service terms, tone documents and the appended llms.txt were checked live. Both paid endpoints returned x402 v2 challenges for 1000 atomic USDC on Base. No payment was made during those checks. Existing bindings and configuration were preserved.

The historical `patch-worker.mjs` records a checked transformation from that release's preceding live source and refuses changed anchors. It is not a current deployment snapshot. Always download and inspect the current Worker before publishing. Preserve the service and verification links in the complete llms.txt when applying an addendum.

Earlier notes recorded the hourly test automation as paused at the owner's request. That note does not establish its current state; keep the saved `/test-line` sample available. The directory's recorded site-pillar check was `2026-09-06T21:43:17.888Z`; this is historical, not a current assessment. The September 8 release served llms.txt as text/plain and linked it in homepage metadata.
