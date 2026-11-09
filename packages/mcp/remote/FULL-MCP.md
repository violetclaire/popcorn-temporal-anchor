# POPCORN remote MCP

Connect a Streamable HTTP MCP client to `https://767-2676.com/mcp`.
The endpoint implements initialization, `tools/list`, and `tools/call` without
requiring a local npm installation. Each request gets a separate MCP server.

Seven tools are available:

| Tool | Behavior |
| --- | --- |
| `popcorn_sample` | Free bundled October 14 TAIN 2.0 receipt and changed-digest control; no outgoing request. |
| `popcorn_catalog` | Free public catalog, offer, and issuer keys. |
| `popcorn_hash` | Hash public bytes submitted to this remote server. Hash private work locally instead. |
| `popcorn_verify` | Free verification using caller-trusted keys and expected values; no outgoing request. Witness payloads are digest-only. |
| `popcorn_verify_v2` | Free digest-only TAIN 2.0 verification using keys fetched from the fixed issuer origin, including predecessor keys. |
| `popcorn_time` | Unpaid x402 challenge by default; optional caller-funded signed time request. |
| `popcorn_witness` | Unpaid x402 challenge by default; optional caller-funded digest witness request. |

Start with `popcorn_sample` and no arguments. Historical evidence does not
establish current time or grant permission. The bundled sample does not perform
an independent issuer-key lookup; use `popcorn_verify_v2` for that check.

## Payment boundary

There is no server wallet. The public remote tools never read `EVM_PRIVATE_KEY`
or create a payment signature. A default call returns a free 402 challenge and
`payment_sent:false`. This is a price/terms check, not a free fresh receipt.

To obtain a new receipt, the caller must obtain its owner's approval, sign the
returned x402 challenge locally, and repeat the same tool arguments with both
`approve_payment:true` and `payment_signature` containing the resulting
PAYMENT-SIGNATURE header. Never submit a private key. The wrapper accepts only
the fixed POPCORN resource, exactly 1,000 atomic USDC units ($0.001), Base network
`eip155:8453`, the published USDC asset, and the published recipient.
It also checks the actual EIP-3009 authorization's recipient, value, sender,
nonce, signature shape and expiry before forwarding. This remote payment path
currently accepts standard EOA signatures only, not smart-wallet signature
envelopes. The issuer performs cryptographic payment-signature verification.

The wrapper forwards one approved proof once. It does not retry a payment after
a timeout. A missing or malformed response after submission is reported as
unknown, because a payment may already have settled. Retain the response and
reconcile before taking further action.

`settlement_reported_by_issuer:true` means the issuer's settlement header and
receipt transaction agree. It is not an independent blockchain check or a
signature check. Verify the returned receipt before relying on it. Time-bound
decisions must account for the caller's own monotonic request/response timing;
this remote intermediary does not supply that measurement for the caller.

## Deployment and scope

`full-worker.ts` is a separate Worker (`popcorn-canonical-mcp`) with a `POPCORN`
service binding to `seven-six-seven-2676`. A narrow `/mcp*` route overlays the
existing site. Paths other than `/mcp` and `/mcp/` pass through unchanged.
The homepage and the existing one-tool verifier Worker are not replaced.
`full-wrangler.jsonc` records the established canonical route so a future
deployment preserves it. To stage a new, unrouted Worker, use a separate
configuration; never deploy an empty route list over this live Worker.

Requests are limited to 128 KiB and 10,000 tool-input elements. Predecessor
chains are limited to eight links. Untrusted browser origins, unrelated hosts,
redirected issuer keys, changed payment terms, and raw witness payload bytes
are refused. All upstream URLs are fixed by code.

The SDK is pinned to 2.3.1 with both body and element limits explicitly enabled.
`test/full-remote.test.ts` exercises transport, sample/tamper checks, payment
gates, fixed terms, timeout behavior, origin rejection, limits and pass-through.

Run `npm run check` in `packages/mcp`. For a free live smoke check:

```sh
node --import tsx remote/full-live-smoke.ts https://767-2676.com/mcp
```

That script performs only verification, catalog reads, and unpaid challenges.
It makes no purchase. Paid forwarding is covered by isolated fixtures; a live
paid end-to-end test is a separate explicitly authorized operation.
