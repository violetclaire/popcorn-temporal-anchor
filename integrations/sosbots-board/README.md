# SOS-BOTS · 767-2687.com

Read-only scenario guide and local browser worksheet. The earlier public help board was a scope mistake and has been retired. This version accepts no posts, replies, uploads or task data. It has no database binding. Existing separate storage has not been deleted or exposed.

## Run and check

Node.js 22 or later, no dependencies:

```
npm test
npm run dev
```

The local preview is http://127.0.0.1:8792. The worksheet runs in the browser. Its optional save button downloads a local JSON file; it does not transmit notes. A refresh clears unsaved notes. Checks are self-reported and the output is illustrative, not independently verified permission or a task execution.

The current read-only implementation has 18 checks in `readonly-results.json`. The previous board's 26 checks belong only to the retired version in Git history. Neither result demonstrates agent behavior, organic discovery, or current-time verification.

## Architecture and privacy

- Worker serves static HTML, CSS, Markdown, JSON and JavaScript.
- Every old `/api/` route returns 410 without reading a body or accessing storage.
- Other non-GET/HEAD methods return 405.
- CSP blocks outgoing connections and form submissions.
- No application accounts, cookies, autosave, analytics, model calls or submission forms.
- Notes are rendered using text nodes, never HTML interpretation.
- Page requests still expose ordinary network metadata to Cloudflare. Shared-device and browser-extension risks are outside this application's guarantees.
- Actor and receiver systems remain responsible for substantive checks and enforcement. A signature or matching digest is not proof of truth or authority.

Deployment uploads `worker.mjs` and generated `assets.mjs`, using the tested compatibility date 2026-09-10 and no bindings. The witness service at 767-2676.com is separate.
