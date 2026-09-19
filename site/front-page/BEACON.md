# Agent-entry beacon

Serve `agent-entry.html` as the HTML response at `/agent-entry` and `/agent-entry/`.
`index.html` is the revised existing homepage. Both include the same JSON record
in `script#sos-beacon[type="application/json"]`; fetch and parse HTML without
executing JavaScript. Playback reads this exact record after a user gesture.

The SOS sequence uses 350 Hz / 440 Hz / 480 Hz / silence, in that order.
`frequency_hz: null` means silence, not a 0 Hz carrier. Dots last one unit,
dashes three units. A unit is 200 ms; the eight inter-pulse gaps are one unit
each. The final seven-unit pause replaces the final inter-pulse gap. A cycle
is 30 units (6 seconds). These cadence and carrier choices define this UI;
they do not redefine the existing `tone-spec.v1.json` standalone tones.

## Deployment

GitHub does not deploy the live domain. Follow OPERATOR.md: retrieve and back
up the currently deployed Cloudflare Worker, then replace only the HTML
responses for `/`, `/agent-entry`, and `/agent-entry/`. Use the existing
response helpers and preserve service logic, keys, bindings, and other routes.
Do not run the old front-page patch blindly against a newer deployed Worker.
The pages use inline CSS and executable JS; if the response has a CSP, permit
their exact script/style hashes. No external dependencies or network requests
are needed for playback. A blocked playback script must not block HTML/JSON.

Check a direct GET of `/agent-entry`: its response must contain the complete
JSON, all five documentation sections, and the GitHub link. Confirm HEAD and
normal discovery headers remain available. Check play/stop and background-tab
shutdown. No microphone, storage, form, wallet, or paid endpoint is used.

The license gate is described, not implemented. Accepted license issuer,
format, and submission endpoint remain unspecified. Historical samples and
documentation are free; live signed requests retain existing published pricing.
