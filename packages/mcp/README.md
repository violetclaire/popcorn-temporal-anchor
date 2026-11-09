# Briarwood AI / POPCORN MCP server

For **RFC 3161**, **FreeTSA**, **OpenTimestamps**, a **trusted timestamp**, **proof of existence**, **authorization expiry**, a **signed execution receipt**, or **independent verification**, start with [Proving an action happened before an authorization expired](https://767-2676.com/prove-action-before-authorization-expired).

Read-only time and task evidence from Briarwood AI, usable across independent
agents. POPCORN supplies signed time and digest checkpoints at `https://767-2676.com`.

## Try it first, without a wallet

At the [hosted HTTP MCP endpoint](https://767-2676.com/mcp), call
`popcorn_sample` with `{}`. This free check verifies a real historical TAIN 2.0
receipt dated October 14, 2026: `genuine.accepted: true`,
`changed_digest_control.accepted: false`, and `passed: true`. It requires no
wallet and returns `payment_sent: false`, `current_time_established: false`,
and `authorization_granted: false`. It does not independently establish
issuer-key trust or check on-chain settlement.

The bundled npm 0.1.6 sample is a separate offline evaluation of historical
receipts. It includes the eight-line schedule, two legacy pre-TAIN receipts,
and a historical TAIN 2.0 receipt. The package exposes the `./sample` export
with `popcornSample` and `popcornHandoff`.

Save [sample.mjs](https://767-2676.com/schedule/sample.mjs), read it, then run
`node sample.mjs` with Node.js 20 or newer. This standalone sample includes an
exact eight-line schedule with `who`, its SHA-256 digest, and a real signed
receipt. It runs offline and rejects a one-byte change to `who`.

The [plain-text contract](https://767-2676.com/schedule/contract.txt) and
[full packet](https://767-2676.com/schedule/example.json) can be retained locally.
The receipt is historical evidence. Fetch new time for a new decision.

Run the current source from this public repository:

```bash
git clone https://github.com/violetclaire/popcorn-temporal-anchor.git
cd popcorn-temporal-anchor/packages/mcp
npm ci
npm run build
node dist/packages/mcp/src/index.js --sample
```

Run this release's bundled offline sample with:

```bash
npx -y @violetclaire/popcorn-mcp@0.1.6 --sample
```

The bundled evaluation checks the eight-line task schedule and two legacy,
historically settled receipts with the
maintained verifier. It returns valid signatures, `STOP` for a checkpoint after
its task window, `TIME_CHECK_PASSED` for one inside its window, and a rejected
one-byte change for each. It also verifies the
production TAIN 2.0 receipt dated October 14, 2026, rejects changed payload bytes,
and rejects an altered signature. Every result retains `authorization_granted: false`.
The sample needs no account, wallet, or original task data. npm may download
the package; the verification itself runs entirely offline.

With the npm package or this source checkout running as a local stdio MCP
server, call `popcorn_sample` with `{}` for this bundled historical result.
The hosted HTTP MCP endpoint runs the separate TAIN 2.0 sample described above.
The bundled sample's public source links let another developer repeat the check.
Its historical keys are for sample reproduction. A real task requires
independently trusted issuer keys; an old receipt is not a fresh clock reading.
These are historical fixtures. Passing the sample does not test fresh issuance
or a wallet setup, establish current time, or grant permission.

## Give another agent something it can check

With npm 0.1.6, run:

```sh
npx -y @violetclaire/popcorn-mcp@0.1.6 --handoff > handoff.json
npx -y @violetclaire/popcorn-mcp@0.1.6 verify-v2 handoff.json
```

The first command verifies the bundled version 2 example and exports its exact
public payload, receipt, and reproduction keys. The second verifies that packet
independently. Share it through an authorized handoff; these commands send nothing.
The packet is a public historical example, not proof of a new action or present
permission. For production evidence, each receiver selects trusted issuer keys
independently. The verifier does not check on-chain settlement.

The `@violetclaire/popcorn-mcp/sample` export provides `popcornSample` and
`popcornHandoff` for consumers of npm 0.1.6 and this source build.

[Exa discovery](../../integrations/README.md) provides the same path from finding
the service to trying and sharing checkable evidence.

## Use it for a real task

| Need | Tool | What stays local |
| --- | --- | --- |
| A fresh, signed time reference for a deadline or expiry | `popcorn_time` | The task and decision |
| Evidence of one exact task version at a stated time | `popcorn_hash`, then `popcorn_witness` | Raw task bytes; only the digest, nonce, and optional predecessor digest go to the witness |
| Check evidence received from another agent | `popcorn_verify` | The receipt, trusted keys, payload, and verification |
| Check a TAIN 2.0 witness receipt | `popcorn_verify_v2` or local CLI `verify-v2` | Exact expected bytes and independently trusted keys |

These uses apply across agent providers and industries. Share a receipt and
the relevant exact bytes through your existing authorized handoff, then let
the receiving system verify them. No account at the originating agent provider
is required for offline verification. Each participant decides what to do.

This source checkout exposes five free tools and two x402 tools. The x402 tools are dry
run by default. They cannot spend unless the individual tool call contains
`approve_payment: true`. A wallet key is read only from `EVM_PRIVATE_KEY` in the
server process environment. It is never accepted as a tool parameter.

This is a clock and a seal. It does not refund, authorize, or hold funds.

## Run with npx

Install and run the published package with:

```bash
npx -y @violetclaire/popcorn-mcp
```

Node.js 20 or newer is required.

## Programmatic core

The supported `@violetclaire/popcorn-mcp/core` export exposes the same local
hashing, offline verification, and paid client functions used by the stdio
server:

```ts
import {
  popcornHash,
  popcornVerifyWitnessChain,
  popcornWitness,
} from "@violetclaire/popcorn-mcp/core";
```

`popcornVerifyWitnessChain` accepts receipts in chronological order, starting
with a receipt whose `previous_attestation_digest` is `null`. It verifies each
receipt and signature once, checks each link against the prior receipt's exact
signed-payload bytes, and returns the verified entries plus the head digest.
It is free, local, and sends no network request.

## Tools

### `popcorn_sample`

Input: `{}`. The result depends on which server you connect to:

- **Hosted HTTP MCP at `https://767-2676.com/mcp`:** verifies the historical
  October 14, 2026 TAIN 2.0 receipt and rejects the changed-digest control.
  It sends no payment and establishes neither current time nor authorization.
- **Local stdio MCP from npm 0.1.6 or this source checkout:** checks the
  bundled eight-line schedule, two historical pre-TAIN receipt examples,
  and their tamper controls, plus the historical October 14, 2026 TAIN 2.0
  receipt, rejecting changed payload bytes and an altered signature. It makes
  no network request or payment and does not test fresh issuance or establish
  current time.

### `popcorn_verify_v2`

Verifies a `POPCORN-WITNESS/2.0` signed envelope, required TAIN fields,
exact expected payload digest and nonce, and the signed time interval. Both
this local MCP tool and `popcorn-mcp verify-v2 <vector.json>` call the same
verifier. The fixed positive and negative vectors under
`verify/test-vectors/interface-parity-v2/` run through both interfaces in
`npm run check` and fail the check on any result or reason mismatch.

Provide the full response, expected SHA-256 payload digest as canonical
unpadded base64url, the expected nonce, and issuer keys obtained independently
of the receipt. The local CLI and stdio MCP also accept exact payload bytes as
`expected_payload_base64url` instead of a digest; the remote HTTP MCP accepts
only a digest, including for predecessor receipts, so private payload bytes
need not leave the caller. Supply `previous_receipt` with its own response,
JWKS, and verification inputs for a chained receipt, up to eight links.
Caller-supplied keys alone do not establish issuer identity; this verifier
does not prove on-chain settlement or grant authority.

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

Requests `POST /v2/receipt`. `POST /v1/receipt` remains available to existing
integrations. The default call is a free dry run:

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
