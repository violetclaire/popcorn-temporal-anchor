# POPCORN MCP server

Local stdio MCP tools for signed POPCORN time and payload checkpoints at
`https://767-2676.com`.

The server exposes three free tools and two x402 tools. The x402 tools are dry
run by default. They cannot spend unless the individual tool call contains
`approve_payment: true`. A wallet key is read only from `EVM_PRIVATE_KEY` in the
server process environment. It is never accepted as a tool parameter.

This is a clock and a seal. It does not refund, authorize, or hold funds.

## Run with npx

The package is not published yet. After publication, the command will be:

```bash
npx -y @violetclaire/popcorn-mcp
```

Node.js 20 or newer is required.

## Tools

### `popcorn_catalog`

Fetches the live service catalog, published JWKS, and public schemas. It is
free and sends no payment.

Input:

```json
{}
```

### `popcorn_hash`

Hashes exact bytes locally and returns the SHA-256 digest plus byte length. It
is free, local, and sends no network request.

Provide exactly one input form:

```json
{ "payload_text": "exact UTF-8 text" }
```

```json
{ "payload_base64url": "ZXhhY3QgYnl0ZXM" }
```

### `popcorn_verify`

Verifies a POPCORN temporal or witness receipt locally against caller-supplied
keys and expected values. It is free, local, and sends no payment.

For a witness receipt:

```json
{
  "receipt_type": "witness",
  "response": { "witness_receipt": {}, "witness_attestation": {}, "payment_status": "settled" },
  "jwks": { "keys": [] },
  "verification": {
    "expected_nonce": "<43-character-base64url>",
    "expected_payload_base64url": "<exact-payload-bytes>",
    "expected_node_id": "767-2676.com",
    "max_clock_accuracy_radius_ms": 10000
  }
}
```

Provide exactly one of `expected_payload_text`,
`expected_payload_base64url`, or `expected_payload_digest`.

When `previous_attestation_digest` is non-null, add this recursively under
`verification`:

```json
{
  "previous_receipt": {
    "response": { "witness_receipt": {}, "witness_attestation": {}, "payment_status": "settled" },
    "jwks": { "keys": [] },
    "verification": {
      "expected_nonce": "<predecessor-nonce>",
      "expected_payload_digest": "<predecessor-payload-digest>"
    }
  }
}
```

The verifier first verifies the predecessor. It then hashes the exact bytes
obtained by base64url-decoding the predecessor compact JWS payload segment and
compares that digest with `previous_attestation_digest`.

For a temporal receipt, `verification.observation` carries the monotonic timer
values required by the existing offline verifier. An optional
`verification.policy` can carry `execution_window_utc`.

### `popcorn_time`

Requests `GET /v1/time`. The default call is a free dry run:

```json
{
  "freshness_ms": 30000,
  "approve_payment": false
}
```

It returns the HTTP 402 terms and the exact request that would be paid. To
authorize one payment, the caller must set `approve_payment` to `true` in that
specific call.

### `popcorn_witness`

Requests `POST /v1/receipt`. The default call is a free dry run:

```json
{
  "digest": "<43-character-sha256-base64url>",
  "nonce": "<43-character-random-base64url>",
  "previous_attestation_digest": null,
  "approve_payment": false
}
```

The optional predecessor digest is SHA-256 over the exact decoded signed
payload bytes of the predecessor compact JWS. It is not a digest of the full
compact JWS string.

Both paid tools lock payment to exactly `$0.001` USDC on Base, the published
USDC contract, and POPCORN's published `payTo`. A changed challenge fails
closed. A successful paid result includes the settlement transaction hash and
`server_processing_duration_ms`.

## Wallet environment

Paid calls require:

```text
EVM_PRIVATE_KEY=0x<dedicated-32-byte-Base-payer-key>
```

Use a dedicated payer with a small balance. Do not commit this value. The free
tools and all dry runs work without it.

## Claude Desktop

Add this server to the `mcpServers` object in Claude Desktop's configuration:

```json
{
  "mcpServers": {
    "popcorn": {
      "command": "npx",
      "args": ["-y", "@violetclaire/popcorn-mcp"]
    }
  }
}
```

That configuration supports all free tools and dry runs. For paid calls,
launch Claude Desktop from an environment containing `EVM_PRIVATE_KEY`, or add
an `env` object to its private local configuration. Never paste the key into a
tool call or chat.

## Claude Code

After publication:

```bash
claude mcp add --transport stdio popcorn -- npx -y @violetclaire/popcorn-mcp
```

Set `EVM_PRIVATE_KEY` in the environment that launches Claude Code only when
paid calls are needed. Every paid call still requires
`approve_payment: true`.

## Local development

From `packages/mcp`:

```bash
npm install
npm run check
npm start
```

The package build includes the repository's existing TypeScript verifier in
the published files. Runtime dependencies remain normal npm dependencies.
