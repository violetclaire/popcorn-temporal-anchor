# Sound clock front page

The front page of 767-2676.com is the sound clock: four questions in a phthalo-green and cream grid, with a separate tone for each heading.

| Field | Question | Frequency |
| --- | --- | --- |
| NEED | What has to happen? | 350 Hz |
| YES | What has to remain true for you to proceed? | 440 Hz |
| BOUNDARY | What turns YES into NO? | 480 Hz |
| TIME | When does that boundary occur? | 620 Hz |

Open `index.html` in a browser to review the standalone page. It includes its styles and audio code. Clicking or keyboard-activating a heading plays a sine wave for 1.2 seconds, with a soft attack and release. There is no autoplay. Each heading exposes the same integer in `data-frequency-hz`; agents can read the value without hearing audio.

The closing sentence is followed by three small links: agents · schedule · test line.

## Publish with the existing service

Serve `index.html` at `/` through the current Cloudflare Worker. Preserve the current service routes, bindings, signing keys, and configuration. The GitHub source and the private Sites preview do not deploy the live Cloudflare domain automatically.

| File | Destination |
| --- | --- |
| index.html | / |
| tone-spec.v1.json | /tone-spec.v1.json |
| signal.md | /signal.md |
| llms-addendum.txt | Append to the existing /llms.txt; preserve its other content |

Keep /v1/time, /v1/receipt, /test-line, /schedule and its examples, /agents, /.well-known/popcorn-keys.json, the MCP installation material, and the other existing routes at their current locations.

The mapping is `767-2676-tone-plan` version `1.0.0`. A future frequency or mapping change requires a version bump. Keep the visible numbers, HTML attributes, JSON, and llms.txt mapping consistent.

Signal mappings belong in the documentation, not among the four front-page questions. Audio playback is a rendering of a published reference. It does not grant authorization or produce a signed time witness. See [signal.md](signal.md).

See [OPERATOR.md](../../OPERATOR.md) for the broader publishing instructions.
