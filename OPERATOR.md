# Publish the sound clock and existing service pages

## 1. Publish the sound clock front page

The standalone source for `/` is now [site/front-page/index.html](site/front-page/index.html).
It presents NEED, YES, BOUNDARY, and TIME in the green and cream grid, with
350, 440, 480, and 620 Hz respectively. The heading buttons play sound only
after user interaction. The closing sentence is followed by the small links
to /agents, /schedule, and /test-line.

Follow [site/front-page/README.md](site/front-page/README.md) to publish the
page, tone specification, and signal documentation. Append the provided
llms addendum to the existing /llms.txt rather than replacing its contents.
The old site/root-proof.patch files describe the previous homepage and
are superseded for the front page.

Retrieve the current deployed Worker before making the root-page change.
Preserve its other routes, service logic, signing keys, bindings, and configuration.
In particular, keep /v1/time, /v1/receipt, /test-line, /schedule and its
examples, /agents, /.well-known/popcorn-keys.json, and the MCP installation
material at their current locations.

Updating GitHub or the private Sites preview does not update 767-2676.com.
Deploy the approved page through the existing Cloudflare Worker using a
valid Cloudflare sign-in, then verify the live domain.

## 2. Publish the demonstration

Publish the three files in [`site/demo`](site/demo) at these exact routes:

| Repository file | Public route |
| --- | --- |
| `site/demo/index.html` | `/demo` and `/demo/` |
| `site/demo/styles.css` | `/demo/styles.css` |
| `site/demo/demo.js` | `/demo/demo.js` |

Serve the HTML with UTF-8 and a restrictive same-origin policy that still
allows `connect-src https://raw.githubusercontent.com`. The page only fetches
the checked-in public STOP packet and `evaluation-outcomes.json`. It never
calls `/v1/time`, `/v1/receipt`, a wallet, or an x402 client.

## 3. Publish the machine door

Publish [`skills/popcorn-temporal-anchor/SKILL.md`](skills/popcorn-temporal-anchor/SKILL.md)
verbatim at `https://767-2676.com/SKILL.md`. The identical OpenClaw package is
kept at [`openclaw/popcorn-temporal-anchor`](openclaw/popcorn-temporal-anchor).

## 4. Smoke-check without paying

From the repository root:

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types examples/witness/verify-settled-sample.mjs
```

Then check only the public pages and files:

- `/` shows the four sound-clock questions, matching 350/440/480/620 Hz attributes, and the three resource links.
- The heading tones require interaction; nothing plays automatically.
- `/tone-spec.v1.json`, `/signal.md`, and the added `/llms.txt` mapping agree.
- `/demo` shows `Valid signature. Closed window. STOP.`
- `Flip byte 226` produces
  `witness_payload_digest_does_not_match_expected`.
- `/SKILL.md` begins with the settled-sample sequence.

Do not probe or submit either paid production endpoint as part of this deploy.
