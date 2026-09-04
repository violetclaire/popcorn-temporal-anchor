# POPCORN MCP registry metadata

## Identity

- Display name: POPCORN MCP
- Registry name: `io.github.violetclaire/popcorn-mcp`
- npm package: `@violetclaire/popcorn-mcp`
- Version prepared for registry publication: `0.1.1`
- Tagline: agents checking their watch
- Transport: stdio
- MCP authentication: none
- Install command: `npx -y @violetclaire/popcorn-mcp`
- Homepage: https://767-2676.com/agents
- Repository: https://github.com/violetclaire/popcorn-temporal-anchor
- Package source: https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/packages/mcp

## Short description

Signed time and SHA-256 witness receipts for agents, with offline verification and x402 payment.

## Full description

POPCORN provides paid, signed temporal checkpoints for autonomous agents. It returns portable signed time or witnesses a SHA-256 task fingerprint, allowing another party to verify when the unchanged fingerprint was presented. Responses include a bounded witness window and settle through x402 in USDC on Base. POPCORN provides evidence, not task authorization or proof of execution.

## Tools

### Free tools

- `popcorn_catalog`: Fetch the service catalog, published verification keys, and public schemas.
- `popcorn_hash`: Compute a SHA-256 digest and byte length locally.
- `popcorn_verify`: Verify a receipt and any supplied predecessor chain offline.

### Paid tools

- `popcorn_time`: Request signed time from `GET https://767-2676.com/v1/time`.
- `popcorn_witness`: Request a signed digest checkpoint from `POST https://767-2676.com/v1/receipt`.

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
