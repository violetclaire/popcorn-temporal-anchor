# Public agent discovery

These files are the published discovery documents at https://767-2676.com:

- `site/public/.well-known/ard.json`: ARD manifest.
- `site/public/.well-known/ai-catalog.json`: AI Catalog 1.0 manifest with the same entries.
- `site/public/skills/task-time/SKILL.md`: instructions to inspect and run the free historical sample.
- `site/public/mcp/server.json`: descriptor for the already published MCP package, currently 0.1.1.

Serve the files at paths relative to `site/public`, with HTTPS, GET/HEAD support and `Access-Control-Allow-Origin: *`. JSON documents use `application/json`; the skill uses `text/markdown`. The production Worker serves these documents from its static asset map. Link the catalogs from `/agents`, `/llms.txt`, `/SKILL.md`, and discovery response headers. This repository directory is a source copy, not a separate automatic deployment.

The catalogs were validated against the upstream schemas in https://github.com/ards-project/ard-spec/tree/main/spec/schemas on September 7, 2026. Public GET/HEAD checks passed after deployment. Publishing a manifest does not guarantee inclusion in Hugging Face or other discovery services.

The public descriptor deliberately advertises the available npm version. Source improvements for 0.1.2 are not an npm publication. Do not change the catalog's package version until that version is available.

The free sample verifies historical signatures and digests and rejects a changed byte. It does not establish current time or grant permission. Fresh x402 witnesses cost $0.001 USDC per request and require payment authorization.
