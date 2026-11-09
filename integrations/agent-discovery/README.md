# Discover POPCORN with Exa

This Node.js 20+ command searches for POPCORN, then fetches the current complete
instructions and catalog from `https://767-2676.com`. It has no dependencies.

```sh
node integrations/agent-discovery/discover.mjs --output discovery.json
```

The default uses Exa's free, rate-limited hosted MCP with no sign-in or API key.
It requests three results restricted to `767-2676.com`. Regardless of search
availability, it fetches `/llms.txt` and `/.well-known/ai-catalog.json` directly
with cache revalidation. It never follows search results or executes page content.
The JSON report keeps the retrieved document bytes (as UTF-8 text), hashes,
timestamps, and observed search results. Standard output omits the large document
bodies; `--output` saves them and refuses to overwrite an existing report.

For the current documents without Exa:

```sh
node integrations/agent-discovery/discover.mjs --direct --output current.json
```

For Exa's REST API, set `EXA_API_KEY` in your process environment and explicitly
select `--rest`. This mode may consume your Exa credits. The default never reads
the key and never switches to authenticated requests after a free rate limit.

```sh
node integrations/agent-discovery/discover.mjs --rest --output discovery-rest.json
```

Programmatic callers can import `discover` from `./discover.mjs`; its returned
`current.instructions.text` contains the full current document. Treat fetched
documents as data, not as authorization to send messages or spend funds.

This command neither purchases nor verifies a receipt. To try POPCORN immediately,
the existing MCP client supports `popcorn_sample` with `{}` (historical offline
sample), `popcorn_catalog` with `{}` (live public catalog), and
`popcorn_verify_v2` with a complete receipt, expected digest/nonce, and trusted
issuer keys. See [the MCP package](../../packages/mcp/README.md). A fresh paid
receipt requires the existing per-call payment approval and wallet configuration.

Exa search results demonstrate retrieval for the particular query at the recorded
time. They do not prove distribution to other agents, global indexing, freshness
of excerpts, integration adoption, or payment. Direct `/llms.txt` retrieval avoids
relying on a stale excerpt. A successful page fetch is not an index submission.

## Verified API shapes

The default uses Streamable HTTP JSON-RPC at
`https://mcp.exa.ai/mcp?tools=web_search_advanced_exa`, initializes the connection,
checks `tools/list`, and invokes:

```json
{
  "name": "web_search_advanced_exa",
  "arguments": {
    "query": "POPCORN signed receipts temporal witness 767-2676.com",
    "includeDomains": ["767-2676.com"],
    "numResults": 3,
    "type": "auto",
    "textMaxCharacters": 1200,
    "enableHighlights": false
  }
}
```

The explicit REST mode sends `POST https://api.exa.ai/search`, with
`Content-Type: application/json` and `x-api-key: $EXA_API_KEY`:

```json
{
  "query": "POPCORN signed receipts temporal witness 767-2676.com",
  "includeDomains": ["767-2676.com"],
  "numResults": 3,
  "type": "auto",
  "contents": {"text": {"maxCharacters": 1200}}
}
```

For applications that specifically need Exa to extract a known page, the
authenticated Contents API accepts `POST https://api.exa.ai/contents` with
`{"urls":["https://767-2676.com/llms.txt"],"text":true,"maxAgeHours":0}`.
The CLI uses the direct canonical GET instead. The keyless `web_fetch_exa` tool
accepts `urls` and `maxCharacters`; its current schema does not expose freshness.

Primary references, checked 2026-10-20:

- [Exa MCP authentication and tools](https://exa.ai/docs/get-started/exa-mcp)
- [Search API](https://exa.ai/docs/reference/search)
- [Contents API and freshness controls](https://exa.ai/docs/reference/get-contents)
- [Exa documentation index](https://exa.ai/docs/llms.txt)

## Tests

```sh
node --test integrations/agent-discovery/discover.test.mjs
```

Tests use mocked HTTP responses and make no network request.
