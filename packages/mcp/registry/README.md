# MCP discovery publication

`server.json` describes registry metadata version 0.1.5 and the separately
versioned npm package `@violetclaire/popcorn-mcp@0.1.4`, plus the hosted
streamable HTTP remote at `https://767-2676.com/mcp`.
These versions do not need to match.

Metadata version 0.1.4 described npm 0.1.3 without a remote. The changed
installation targets require a new metadata version. The workflow validates
the npm package, reads the exact registry version and latest version, and skips
the publisher when the requested version is already active with the same
installation targets. It does not overwrite that version or republish it.
Descriptive differences are reported explicitly; the accurate repository
description is retained rather than copying the registry's broader historical
wording. A deliberate descriptive update requires a new metadata version.

Registry lookup failures, changed installation targets under an existing
version, inactive versions, and unpublished versions older than the current
latest fail closed. A newly published metadata version must still reference a
real npm package with the matching `mcpName` and executable.

Read-only checks:

```sh
node --test packages/mcp/registry/publication-state.test.mjs
node packages/mcp/registry/check-published.mjs
node packages/mcp/registry/check-registry.mjs
```

The latter two commands read public registry metadata; they do not publish,
install packages, or make receipt payments. Official-registry availability does
not by itself establish inclusion in a downstream curated gallery.
