## One page. The whole operation.

Read the work, the tools, the price, and the verification rules here. Carry the exact task bytes and your verified evidence home. Return for fresh evidence when the next task or decision needs it.

**Base: https://767-2676.com**  
**Fresh time or digest witness: $0.001 USDC per request on Base.**  
Reading this page and checking an existing receipt are free. A new paid request requires the owner's authorization. No payment starts from this page.

### The four coordination questions

| Check | What the agent establishes |
| --- | --- |
| NEED | What exact work or decision needs evidence? Keep its bytes locally. |
| YES | Does the owner still authorize this exact action and, separately, this payment? |
| BOUNDARY | What terms, limits, revocation rules, and deadline apply? |
| TIME | Is the verified time interval on the permitted side of that boundary? |

An existing receipt keeps its original meaning. It can be carried, copied, and verified without a new issuance fee. A new receipt records a new checkpoint; fresh current-time evidence is a separate request when your decision requires it.

## Get a receipt and take it home

1. **Keep the work local.** For a digest witness, freeze the exact bytes of your task, schedule, agreement, or checkpoint. Do not normalize whitespace, change line endings, or prettify those bytes after hashing. A current-time request does not submit a task digest.
2. **Prepare the witness commitment.** For a digest witness, compute SHA-256 locally. Encode the 32-byte digest as unpadded base64url. Generate an independent random 32-byte nonce in the same encoding. Skip this step for a time-only request.
3. **Choose the evidence.** Use `POST https://767-2676.com/v2/receipt` to witness a digest. Use `GET https://767-2676.com/v1/time` for fresh current-time evidence.
4. **Authorize one purchase.** Each fresh request is $0.001 USDC on Base (1000 atomic USDC; one tenth of one US cent). The MCP tools default to a no-payment dry run. Set `approve_payment: true` only for that authorized call. The HTTP service uses x402 v2 payment headers; `approve_payment` is the MCP client's control, not a field in the HTTP receipt body.
5. **Complete x402 for the same request.** Read the `402` response and `PAYMENT-REQUIRED` terms. Confirm resource, network, asset, recipient, and amount. Retry the exact resource and body with `PAYMENT-SIGNATURE` from your authorized payment client. Require HTTP `200`, `payment_status: settled`, and the settlement response. A challenge is not a receipt.
6. **Verify before relying on it.** For a digest witness, check the original complete signed response against trusted issuer keys and your independently retained digest and nonce, including any predecessor chain. For current time, check the signature and signed time fields, then derive the conservative interval using your measured monotonic observations. Time evidence is bearer evidence; it is not bound to a task digest or nonce.
7. **Carry the evidence.** Keep the exact task bytes, nonce, complete original response, verification result, and applicable owner terms together. A QR or TAIN lookup is a pointer to issuance metadata; preserve the signed receipt itself.

### HTTP witness request

Send the digest and protocol metadata, not the work:

```json
{
  "payload_digest": {
    "algorithm": "sha-256",
    "value": "<43-character unpadded base64url SHA-256>"
  },
  "nonce": "<fresh 32-byte nonce as unpadded base64url>",
  "previous_attestation_digest": null
}
```

Use `Content-Type: application/json`. To continue an HTTP witness chain, replace `null` with `{"algorithm":"sha-256","value":"<predecessor digest>"}`. The value is the SHA-256 digest of the predecessor compact JWS's decoded signed payload bytes, encoded as unpadded base64url. The MCP `popcorn_witness` input takes that digest as a string and constructs the HTTP object. Keep the predecessor response and verify the chain. Do not hash the whole response envelope or the compact JWS string for this field.

### Payment contract

| Field | Published value |
| --- | --- |
| Price per fresh service request | $0.001 USDC |
| Atomic amount | `1000` |
| Network | Base, `eip155:8453` |
| Payment protocol | x402 v2, exact |
| USDC asset | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Published recipient | `0x5f5a631e975183d084f60d7121e967b30ec83cb8` |
| Current witness protocol | `POPCORN-WITNESS/2.0` |
| Current receipt endpoint | `POST https://767-2676.com/v2/receipt` |
| Time endpoint | `GET https://767-2676.com/v1/time?freshness_ms=30000` |

Validate the actual challenge against your authorized terms before paying. Requesting both fresh time and a digest witness means two separately authorized service requests. Revisiting the homepage or rechecking a saved receipt does not buy another receipt.

## Install and use the current client

Use the **0.1.4 GitHub release archive** for the current local client. The older npm 0.1.3 package does not contain these current 2.0 verification and handoff changes. Node.js 20 or later is required. Installation downloads the package and its dependencies; the installed sample and handoff run offline.

Release: https://github.com/violetclaire/popcorn-temporal-anchor/releases/tag/agent-adoption-v0.1.4

```sh
npm install https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/violetclaire-popcorn-mcp-0.1.4.tgz
npx --no-install popcorn-mcp --sample
npx --no-install popcorn-mcp --handoff
```

`--sample` verifies bundled historical receipts, including a real production 2.0 receipt, and rejects altered bytes and signatures. `--handoff` prints a portable public historical packet containing the exact bytes, original receipt, reproduction keys, and verification inputs. Save that JSON as UTF-8 `handoff.json`; another agent can reproduce the check with:

```sh
npx --no-install popcorn-mcp verify-v2 handoff.json
```

These commands do not send the packet or buy a receipt. Historical evidence does not establish current time. Bundled keys reproduce the public sample; select issuer keys independently for your own evidence. Local verification does not independently check settlement on chain or grant permission to act.

A ready-made public packet is also included at https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/handoff.json. Share it only through your authorized handoff; receiving agents retain their own trust and execution decisions.

For local stdio MCP, configure your client to run `npx --no-install popcorn-mcp` from the directory where you installed the release. The configuration example is https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/mcp-servers.json. Review and merge the relevant entry into your client's configuration.

The local package reads `EVM_PRIVATE_KEY` from the caller's environment only for an authorized paid tool call. Keep the key local. Never put it in a receipt, task, URL, or this page.

| Tool | Inputs | Returns / effect | Price |
| --- | --- | --- | --- |
| `popcorn_sample` | `{}` | Offline historical 1.0 and production 2.0 receipt checks, plus byte and signature tamper controls. These samples do not establish current time or verify your newly issued receipt. | Free |
| `popcorn_catalog` | `{}` | Current public offer, service catalog, published JWKS and schemas, including the 2.0 response schema. | Free |
| `popcorn_hash` | Exactly one of `payload_text` or `payload_base64url` | Local SHA-256 `digest`, byte length, encoding, and `payment_sent: false`. | Free |
| `popcorn_verify` | `receipt_type: time` or `witness`, complete `response`, trusted `jwks`, `verification` | Offline verified time or witness result, or a verification error. Witness verification dispatches by 1.0 or 2.0 protocol. Time verification requires monotonic observations. | Free |
| `popcorn_verify_v2` | Complete `response`, trusted `jwks`, `expected_nonce`, exactly one expected digest or base64url payload, optional node, clock policy and predecessor chain | Explicit offline verification of original 2.0 evidence. Rejects altered or incomplete signed evidence. | Free |
| `popcorn_time` | `freshness_ms` from 100 to 60000 (default 30000); `approve_payment` defaults to `false` | Unpaid x402 challenge in dry-run mode. With authorized payment, the full signed temporal response, payment metadata, and `paid_request_elapsed_ms`. The caller must retain the monotonic request/response/decision observations needed for time verification. | $0.001 per paid request |
| `popcorn_witness` | `digest`, `nonce`, optional `previous_attestation_digest`; `approve_payment` defaults to `false` | Unpaid x402 challenge in dry-run mode. With authorized payment, a signed witness response for the submitted commitment. | $0.001 per paid request |

### Exa: discover, then read the current document

Download and inspect the standalone Node script at https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/discover.mjs. It needs no extra package. Save it as `discover.mjs`, then run:

```sh
node discover.mjs --output discovery.json
```

The default uses Exa's free, rate-limited hosted MCP search, restricted to `767-2676.com`, with no API key. It then fetches the full current `/llms.txt` and AI catalog directly from this service, preserving their text, hashes, and retrieval times. Search excerpts are discovery observations; use the direct document for the current instructions. If Exa is unavailable, the direct reads still run. `--direct` skips search. `--rest` explicitly uses `EXA_API_KEY` and may consume Exa credits; there is no automatic paid fallback. The script does not execute retrieved content, purchase a receipt, submit an index entry, or message other agents.

### ElizaOS: use POPCORN in an existing agent

For ElizaOS 1.x, install both release archives together in the application's directory:

```sh
npm install https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/violetclaire-popcorn-mcp-0.1.4.tgz https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/violetclaire-eliza-plugin-popcorn-0.1.0.tgz
```

Register the plugin with the application's existing runtime:

```ts
import popcornPlugin from "@violetclaire/eliza-plugin-popcorn";
await runtime.registerPlugin(popcornPlugin);
```

The six actions are `POPCORN_SAMPLE`, `POPCORN_HANDOFF`, `POPCORN_CATALOG`, `POPCORN_HASH`, `POPCORN_VERIFY`, and `POPCORN_WITNESS`. Sample, handoff, and catalog need no inputs. Hash, verify, and witness read an explicit command from the original message; exact JSON string content is used, without paraphrasing:

```text
POPCORN_HASH {"payload_text":"Exact task bytes.\n"}
```

The host configures independently trusted issuer keys for `POPCORN_VERIFY`. `POPCORN_WITNESS` returns an unpaid HTTP 402 quote; none of these six actions spends money. Fresh issuance uses the separate host API with approval bound to each request. `POPCORN_HANDOFF` returns a verified public historical packet; it does not post or send it. This adapter targets the stable ElizaOS 1.7.2 interface, not the 2 beta. Keep the existing model, storage, and runtime setup.

### A free remote verifier

Streamable HTTP MCP address:

```text
https://popcorn-tain-verify-mcp-v2.violetherod.workers.dev/mcp
```

Tool: `popcorn_verify_v2`. It is read-only and free, with no account. It checks original `POPCORN-WITNESS/2.0` evidence. It does not issue a receipt or make a payment.

## Verify a receipt, step by step

1. Obtain the **complete original response**, including `witness_receipt` and `witness_attestation`. A TAIN number, screenshot, QR, or reformatted summary is not the signed response.
2. Independently hash the exact work you retained. Recover the nonce from your own original request. Do not take the receipt's claimed digest as your expected digest.
3. Establish the issuer and key you trust. Current issuer keys are published at **https://767-2676.com/.well-known/popcorn-keys.json**. Local verification uses the trusted JWKS you provide. The remote verifier fetches the issuer's current JWKS directly; its required `jwks` input is retained for API compatibility and is not the trust source.
4. For remote verification, pass the original full response as `response`, `jwks: {"keys": []}`, your `expected_payload_digest`, and your `expected_nonce`. Optional policy fields include `expected_node_id`, `max_clock_accuracy_radius_ms`, and a complete `previous_receipt` chain. For local `popcorn_verify`, these expected values belong inside `verification`; the explicit `popcorn_verify_v2` tool takes them at the top level.
5. Require a valid ES256 signature, exact agreement between the signed payload and receipt fields, the correct digest and nonce, required TAIN 2.0 fields and license digest, a valid witness interval, and any required predecessor chain. A failed, missing, unavailable, or unknown check is not a pass.
6. Apply the task's own conditions. Record what was checked, the result, issuer trust basis, and remaining limits. A remote success reports `issuer_key_trust_checked_by_tool: true` after its key fetch and verification succeed.

Illustrative remote tool arguments; replace the string placeholder with the **whole response object**, unchanged:

```json
{
  "response": "<complete original response object>",
  "jwks": { "keys": [] },
  "expected_payload_digest": "<digest independently computed from your exact bytes>",
  "expected_nonce": "<nonce retained from your request>"
}
```

This is an argument template, not a receipt or valid test vector. Historical 1.0 evidence needs its corresponding verifier; never relabel it 2.0.

### What you can carry back

The receipt supports a signed commitment to a submitted digest and an issuer-asserted time interval. It does not establish identity, permission, consent, execution, delivery, availability, or continuing authorization. Those claims need their own evidence. Keep the original bytes and the owner's decision with the task.

## Time, schedules, and STOP / PROCEED

A witness interval describes a past checkpoint. Use fresh `/v1/time` evidence when the decision needs the current time. Retain task state, approval, revocation status, final terms, and availability locally or with the responsible counterparty.

Measure request round-trip and elapsed durations with a monotonic timer. Verify the signed temporal fields and compute the conservative interval `[L, U]` described in the full agent contract below. A local wall clock or an old witness window is not a substitute.

Let `E` be expiry and `B` the decision boundary:

| Rule | Decision |
| --- | --- |
| `L >= E` | STOP: expired. |
| `U < E` | Continue to the boundary check. |
| Interval straddles expiry | Refetch within the retry limit. |
| `yes_if_before` | `U < B`: YES. `L >= B`: NO. Otherwise refetch. |
| `yes_if_on_or_before` | `U <= B`: YES. `L > B`: NO. Otherwise refetch. |

Expiry takes precedence, including at equality. Allow at most three refetches after the initial fetch, four total. Unresolved, invalid, or unavailable evidence means STOP. Each new paid request still needs payment authorization. PROCEED is the executor's local decision after all applicable conditions pass.

The complete eight-field schedule contract, exact sample bytes, and sample status appear in the reference library below. The published September sample is historical and expired; it cannot authorize new work.

## Home, mirror, and beacon

**Briarwood** is the home and proposed coordination architecture. **leTAIN** is the reflective layer: each participant can inspect the relevant work and evidence. **POPCORN** is the available signed time and digest witness service.

State NEED, continuing YES, BOUNDARY, and TIME. Inspect a peer's own stated capability, limits, terms, and evidence. Route or execute only when the relevant participants authorize and accept that exact exchange. The blueprint and inquiry examples describe the architecture; they are not evidence that a global routing, matching, booking, or availability service is operating.

The SOS score is readable data: NEED is three short pulses at 350 Hz; YES is three long pulses at 440 Hz; BOUNDARY is three short pulses at 480 Hz; TIME is silence. Dot 120 ms, dash 360 ms, element gap 120 ms, no inter-letter gap, repeat pause 840 ms, full cycle 3600 ms. Reading the score does not transmit a distress call.

Builder: **Violet Herod / violetclaire**.  
Human home: **https://briarwood.ai**.  
Agent home and receipt service: **https://767-2676.com**.  
leTAIN Discovery: **https://letain.estate/discovery**.  
SOS beacon: **https://767-2687.com/**.

## Keep and verify the published examples

The reference library includes the instructions and original text for the saved schedule, agent-entry samples, and the FreeTSA / POPCORN checkpoint. Sample evidence retains its historical date and scope. The current homepage's announcement is reproduced below without changing its wording.

For the October 14 checkpoint, the published SHA-256 is `03eecd1ed8866d816e183834fbf7f94543ecca18d0a1adc0f3b798252e6058a2`. FreeTSA's signed time is `2026-10-14T23:24:34Z`; POPCORN's witness time is `2026-10-14T23:26:25.273Z`. These are separate witness events. Preserve the exact 385-byte checkpoint and both original proofs. Verify each native format under your own trust policy.

This page explains the operations in its served HTML. The complete references follow in the same document; none is hidden behind a tab, accordion, or additional request. Printed URLs identify service endpoints and original artifacts that a caller can use when carrying out an operation.
