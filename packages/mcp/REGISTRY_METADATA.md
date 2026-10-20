# POPCORN MCP registry metadata

## Identity

- Display name: POPCORN MCP
- Registry name: `io.github.violetclaire/popcorn-mcp`
- npm package: `@violetclaire/popcorn-mcp`
- Version prepared for registry publication: `0.1.4`
- Tagline: agents checking their watch
- Transport: stdio
- MCP authentication: none
- Install: use the 0.1.4 GitHub release archive in README.md until that version is published to npm.
- Homepage: https://767-2676.com/agents
- Repository: https://github.com/violetclaire/popcorn-temporal-anchor
- Package source: https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/packages/mcp

## Short description

Signed time and task-version receipts for independent agents. Try the bundled verification free.

## Full description

POPCORN by Briarwood AI provides signed time and task-version evidence for independent agents handling deadlines, expiry, and handoffs. Try bundled historical version 1 and version 2 receipts and tamper checks with `popcorn_sample`, free and offline. For a new task, obtain signed time or witness a locally computed SHA-256 digest for $0.001 USDC on Base through x402. Participants retain their raw task data and verify the signed evidence locally. Each participant remains responsible for identity, authorization, and execution.

## Tools

### Free tools

- `popcorn_sample`: Run the bundled historical receipt and tamper checks without inputs, a wallet, or network access.
- `popcorn_catalog`: Fetch the service catalog, published verification keys, and public schemas.
- `popcorn_hash`: Compute a SHA-256 digest and byte length locally.
- `popcorn_verify`: Verify a receipt and any supplied predecessor chain offline.
- `popcorn_verify_v2`: Verify a TAIN 2.0 envelope against retained expected bytes or a digest and nonce.

The separate `registry/server.json` remains pinned to the already published npm
version. Update it only after npm 0.1.4 publication is confirmed; `server.json`
in this directory is prepared metadata, not evidence of registry publication.

### Paid tools

- `popcorn_time`: Request signed time from `GET https://767-2676.com/v1/time`.
- `popcorn_witness`: Request a signed digest checkpoint from `POST https://767-2676.com/v2/receipt`; `/v1/receipt` remains compatible.

## Payment invariants

- Paid tools are dry run by default.
- Payment is possible only when the individual tool call includes `approve_payment: true`.
- The payer key is read only from `EVM_PRIVATE_KEY`. It is never accepted as a tool parameter.
- The server accepts only the published `$0.001` USDC price on Base mainnet.
- A changed asset, network, amount, recipient, or resource fails closed.
- Successful paid responses include the settlement transaction hash and `server_processing_duration_ms`.
- Free tools and dry runs require no wallet.

## Boundary

This is a clock and a seal. It does not refund, authorize, or hold funds.

POPCORN provides evidence. It does not prove identity, grant task authorization, or prove execution.

## Discovery keywords

`mcp`, `mcp-server`, `model-context-protocol`, `x402`, `agents`, `time`, `timestamp`, `attestation`, `receipts`, `base`, `usdc`
