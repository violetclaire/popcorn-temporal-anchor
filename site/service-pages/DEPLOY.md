# Publish pricing and service terms on the existing POPCORN Worker

Status: prepared for integration, not deployed by this repository.

The actual production Worker and its Cloudflare configuration are outside this
repository. This module is an additive document handler, not a replacement
Worker. Do not deploy it as the application's entry point. It is independent
of the broader, unmerged agent-readiness PR #4.

## Evidence checked on 2026-09-07 UTC

- GET `/pricing` and `/terms`: 404, `route_not_found`.
- GET `/llms.txt`: 200, Markdown containing the live service documentation.
- GET `/robots.txt`: 200, `User-agent: *`, `Allow: /`.
- Live `/agent/offer` prices both canonical services at 0.001 USDC on Base.
- Live OpenAPI version 1.12.1 documents 1000 atomic USDC units for both
  canonical routes, the legacy time alias, and the reference handoff route.
- The unpaid time challenge also declares 1000 atomic USDC units on
  `eip155:8453`. No payment was authorized or made.
- The homepage and repository SECURITY.md publish `violet@briarwood.ai`.
- x402 List shows all 14 protocol checks passing but marks these three site
  signals absent. Its methodology measures reachability. This does not prove
  why its llms.txt check failed or when it will refresh.

## Integrate

Copy `service-pages.mjs` beside the actual Worker's source files and import:

```js
import { handleServiceDocument } from './service-pages.mjs';
```

Inside the existing fetch handler, before paid-route dispatch and the final
404 fallback, add:

```js
const serviceDocument = handleServiceDocument(request);
if (serviceDocument) return serviceDocument;
```

Use the existing request variable's name. Preserve current security middleware,
signing, payment verification, bindings, deployment settings, and all other
handlers. This handler returns null for every path except GET/HEAD on
`/pricing`, `/pricing/`, `/terms`, and `/terms/`.

## Link the pages

Append these links to the existing homepage and `/agents` footer, preserving
their current contents:

```html
<a href="/pricing">Pricing</a>
<a href="/terms">Terms</a>
<a href="/llms.txt">Agent documentation</a>
```

Append this section to the existing source of `/llms.txt`. Do not replace the
whole document with a downloaded snapshot:

```markdown
## Pricing and service terms

- [Pricing](https://767-2676.com/pricing): 0.001 USDC per signed time or payload witness request on Base through x402 v2; public documentation and historical sample verification are free.
- [Service terms](https://767-2676.com/terms): Evidence scope, payment authority, verification responsibilities, endpoint-specific data handling, and support.
```

Add `/pricing` and `/terms` to the existing sitemap. Add
`"termsOfService": "https://767-2676.com/terms"` inside the existing OpenAPI
`info` object, preserving its other fields. Keep `/llms.txt` public and preserve
the existing `robots.txt` allowances. All three public documents must be
readable without JavaScript execution, login, a wallet, or a payment challenge.

## Content boundaries

The terms document describes operational use and verified service scope. It
does not introduce arbitration, a liability cap, a blanket no-refund rule,
a refund guarantee, an uptime SLA, or an unverified logging/retention policy.
The private-input description is scoped to `/v1/receipt`; `/agent/handoff`
accepts task content under a separate contract. No claim is made that the
service is a certified clock or that evidence itself grants authorization.

## Validate and release

Run `node --test site/service-pages/service-pages.test.mjs` in this repository.
In the actual deployment project, run its existing checks and inspect the
complete diff before deploying through its established Cloudflare path.

After deployment, verify the live origin, not just a local preview:

1. GET and HEAD on `/pricing` and `/terms` return 200 and HTML; HEAD is empty.
2. GET `/llms.txt` returns 200 and the appended links.
3. The homepage and `/agents` contain visible links to all three documents.
4. Existing clock, keys, samples, agent guide, and public API metadata remain
   accessible. Check paid-route preservation with existing local tests; no
   paid request is necessary for this documentation release.
5. Compare the published price against the current offer and OpenAPI.
6. Check the x402 List service's `assessment.site` in its public API after
   reassessment. Do not report the Xs fixed until its own measurements change.
   There is no confirmed free force-refresh endpoint in the reviewed docs.
   If llms.txt remains marked missing, inspect its recorded URL/status and
   Cloudflare events before changing any access rules. Keep paid verification
   purchases separate from this documentation task.

Sources:
- https://767-2676.com/agent/offer
- https://767-2676.com/openapi.json
- https://x402-list.com/services/767-2676-com-popcorn
- https://x402-list.com/methodology
- https://x402-list.com/api
- https://developers.cloudflare.com/workers/runtime-apis/response/

Rollback: remove the handler call/import and only the links/metadata added by
this release, then redeploy the previous production version. Keep the current
llms.txt and all existing service routes intact.
