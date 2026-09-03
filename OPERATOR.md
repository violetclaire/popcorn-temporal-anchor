# Publish `/` and `/demo`

The live homepage source is not in this repository. These files are the exact
handoff for the operator that owns `767-2676.com`.

## 1. Keep the clock and add its one-line pitch

Do not replace the clock, its server-synchronized epoch, or its audio assets.

1. Append [`site/root-proof.patch.css`](site/root-proof.patch.css) after the
   homepage's current CSS. This makes phthalo green the page background and
   uses warm cream for type and rules.
2. Replace the current `<section class="agent-proof">...</section>` with the
   complete contents of
   [`site/root-proof.patch.html`](site/root-proof.patch.html).

The only public pitch immediately under the clock will read:

> A note is not a check. These 228 bytes are. Try the sample → /demo

The `For agents` block follows it. Its first link is `/demo`.

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

- `/` still shows a live San Francisco / Pacific clock and the note button.
- `/demo` shows `Valid signature. Closed window. STOP.`
- `Flip byte 226` produces
  `witness_payload_digest_does_not_match_expected`.
- `/SKILL.md` begins with the settled-sample sequence.

Do not probe or submit either paid production endpoint as part of this deploy.
