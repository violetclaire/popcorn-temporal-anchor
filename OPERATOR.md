# Release the agent entry repair

The production Worker source and Cloudflare deployment configuration are not
in this repository. This release supplies an additive integration for that
Worker, not a replacement for its clock, payment, or signing implementation.

## Build and verify

From this repository's root with Node.js 24 or newer:

```bash
node site/build-agent-entry.mjs
node --test site/test/agent-entry.test.mjs
node --experimental-strip-types examples/witness/verify-settled-sample.mjs
```

The build checks both skill copies and embeds the unchanged historical samples.
It performs no network request or payment. The generated module has no signing
key, wallet credential, task store, or package-install requirement.

## Integrate with the production Worker

Copy `site/generated/agent-entry.mjs` beside the existing Worker entry module.
Import `handleAgentEntry`, then call it in the existing fetch handler after
common request processing and before the old document-route dispatch:

```js
import { handleAgentEntry } from "./agent-entry.mjs";

// Inside the existing fetch(request, env, ctx) handler:
const agentDocument = handleAgentEntry(request);
if (agentDocument) return agentDocument;
// Continue through the existing production route dispatch unchanged.
```

Preserve the existing default export, named Durable Object exports, bindings,
scheduled handlers, payment processing, and all remaining route dispatch. The
module deliberately has no default fetch handler; it cannot replace the service
by itself. Review and build the actual production Worker before using its
existing deployment workflow.

Only GET, HEAD, and OPTIONS for these public routes are handled:

| Route | Source |
| --- | --- |
| `/agents`, `/agents/` | `site/agents/index.html` |
| `/demo`, `/demo/` | `site/demo/index.html` |
| `/demo/styles.css`, `/demo/demo.js` | Demonstration assets |
| `/SKILL.md` | Canonical `skills/popcorn-temporal-anchor/SKILL.md` |
| `/llms.txt` | `site/llms.txt` |
| `/docs/temporal-usage.md` | `docs/TEMPORAL_USAGE.md` |
| `/samples/evaluation-packet.production.json` | Unchanged STOP packet |
| `/samples/evaluation-packet.proceed-002.production.json` | Unchanged PROCEED packet |
| `/samples/evaluation-outcomes.json` | Unchanged historical outcome record |
| `/sitemap.xml` | Generated free-document index |

Other routes and methods return `null` for the original Worker to handle.
In particular, `/`, `/time`, `/v1/time`, `/v1/receipt`, the offer, manifests,
verification keys, schemas, and status routes are not replaced.

The homepage already links to `/agents`, so its clock, audio, and design need
no replacement. The earlier root-proof patches remain optional assets; they
are not necessary for this routing repair.

## Verify the deployed origin

```bash
node site/check-agent-entry.mjs --origin https://767-2676.com
```

This sends only public GET requests and never pays. It verifies the served
skill, sample, and demo bytes against this release, reads the existing discovery
contracts, and inspects the existing unpaid time challenge. It fails for a 403,
404, unexpected redirect, browser challenge, or mismatched document.
A passing repository build is not evidence of production deployment.

The demo now fetches only same-origin samples. Its CSP permits same-origin
scripts, styles, and connections; no GitHub fetch or payment endpoint is needed.
Check the real page's signature result and one-byte control after deployment.

## Cloudflare access

If public documentation or key routes return error 1010 or a browser challenge,
inspect the matching security event in the owning Cloudflare account. Correct
only the identified rule for the intended public GET/HEAD routes; preserve
protections on operational paths. Do not assume robots.txt overrides a security
rule, change client identity to claim the failure is fixed, or disable protection
for the entire zone.

## External discovery

- Republish the synchronized skill through the existing authenticated ClawHub
  publisher. Verify the actual served instructions after publication.
- npm already hosts `@violetclaire/popcorn-mcp@0.1.1`.
  `packages/mcp/server.json` describes that version. Official MCP Registry
  publication requires the owner's authenticated namespace. The JSON file and
  npm package alone do not establish a registry listing.
- Query Bazaar for both canonical resources and inspect accepted discovery
  metadata. An API timeout is unknown status, not proof of absence. This repair
  does not make a payment to trigger indexing.

Do not report the site fully ready until its deployed public routes and the
intended discovery listings have been verified.
