# POPCORN for ElizaOS

An ElizaOS 1.x plugin for Briarwood POPCORN. Run a historical receipt sample,
discover the service, hash exact content, verify an existing receipt, or request
an unpaid witness quote. These six agent actions send no payment. Fresh witness
issuance is available only through a separate host API with approval for each call.

Tested against the published `@elizaos/core@1.7.2` action and plugin interfaces,
on Node 24; Node 20 or later is required by the POPCORN client. This adapter does
not target the ElizaOS 2 beta or register social posting tools.

## Install and try

Install the two built release archives together in your ElizaOS application's
directory. Installing both prevents npm from looking for a POPCORN version that
has not yet been published to the npm registry:

```sh
npm install https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/violetclaire-popcorn-mcp-0.1.4.tgz https://github.com/violetclaire/popcorn-temporal-anchor/releases/download/agent-adoption-v0.1.4/violetclaire-eliza-plugin-popcorn-0.1.0.tgz
```

The published older `@violetclaire/popcorn-mcp@0.1.3` cannot verify current witness
v2 receipts. This integration requires `^0.1.4`; do not substitute 0.1.3.
Installation may download dependencies. Once installed, this one command runs
the bundled sample without a network request, wallet or payment:

```sh
npx --no-install popcorn-mcp --sample
```

The sample reproduces historical evidence and tamper controls. Its signed
timestamps remain historical: it is not a current clock reading or a new receipt.

## Register the plugin

In an existing ElizaOS project, import the plugin and include it in the project's
plugin list:

```ts
import popcornPlugin from "@violetclaire/eliza-plugin-popcorn";

// Add to your existing project's plugins array:
const agent = { character, plugins: [popcornPlugin] };
```

Alternatively, an application that already owns an `IAgentRuntime` can call
`await runtime.registerPlugin(createPopcornPlugin())`. Preserve your existing
model, database, and runtime setup. This package supplies the POPCORN plugin only.

`POPCORN_SAMPLE`, `POPCORN_HANDOFF` and `POPCORN_CATALOG` require no input.
`POPCORN_HANDOFF` returns a verified public historical receipt packet for another
agent to check; it does not send the packet or post a message. Save its result as
`handoff.json` and run `npx --no-install popcorn-mcp verify-v2 handoff.json` to
reproduce the check. The remaining actions
read an explicit command from the original `message.content.text`:

```text
POPCORN_HASH {"payload_text":"Exact task text, including its whitespace.\n"}
```

```text
POPCORN_WITNESS {"digest":"<canonical base64url SHA-256>","nonce":"<canonical base64url 32-byte nonce>"}
```

`POPCORN_WITNESS` sends an unpaid request to `/v2/receipt` and returns the HTTP
402 challenge. It does not issue a signed receipt. Generate the nonce in trusted
application code, for example `randomBytes(32).toString("base64url")` from
`node:crypto`. An optional `previous_attestation_digest` is a canonical base64url
SHA-256 digest of the predecessor compact JWS's decoded signed payload bytes.

Commands must contain exactly one JSON object. Markdown fences, prose surrounding
the command, unknown fields and `approve_payment` are rejected. For binary input,
use `payload_base64url` instead of `payload_text`; both cannot be supplied together.
JSON string escapes are decoded before hashing. The hash covers the resulting
exact UTF-8 string, not the surrounding JSON command or a model's summary.

ElizaOS 1.7.2 does not define the newer structured action-parameter API. This
adapter therefore uses this explicit command boundary, rather than assuming that
ElizaOS populates a field such as `options.parameters`. Applications may replace
the parser with `resolveInput(operation, {runtime, message, state})` to load exact
bytes and receipt envelopes from their own storage. Treat message data as
untrusted; it cannot configure issuer keys, wallet keys or payment approval.

## Verify existing evidence locally

Select and retain issuer keys independently from the receipt. Configure the
plugin once with that trusted JWKS:

```ts
import { readFile } from "node:fs/promises";
import { createPopcornPlugin } from "@violetclaire/eliza-plugin-popcorn";

const trustedJwks = JSON.parse(await readFile("./trusted-popcorn-keys.json", "utf8"));
const popcornPlugin = createPopcornPlugin({ trustedJwks });
```

The issuer publishes keys at
[`https://767-2676.com/.well-known/popcorn-keys.json`](https://767-2676.com/.well-known/popcorn-keys.json).
Obtaining and deciding to trust those keys is a host responsibility. Do not use a
key merely because it arrived with a receipt or command. Verification itself is
local and free after the input and trusted keys are available.

Send `POPCORN_VERIFY` followed by JSON with these three fields:

```json
{
  "receipt_type": "witness",
  "response": { "full": "unmodified POPCORN response envelope goes here" },
  "verification": {
    "expected_payload_digest": "<the locally calculated SHA-256 digest>",
    "expected_nonce": "<the nonce originally sent>"
  }
}
```

The `response` above is a shape illustration, not a valid sample receipt. Supply
the complete saved response. Instead of `expected_payload_digest`, verification
accepts exactly one of `expected_payload_text` or `expected_payload_base64url`.
Optional policies include `expected_node_id` and
`max_clock_accuracy_radius_ms`. For a chain, each `previous_receipt` contains
`response` and `verification`; the adapter supplies host-selected keys at every
level and accepts at most eight predecessor levels. Configure a trusted key set
that includes the required historical signing keys. Keys in the command are
rejected.

For temporal receipts use `receipt_type: "time"` and
`verification: {observation, policy?}`. The observation requires the caller's
`paid_request_start_monotonic_ms` and `paid_response_receive_monotonic_ms` from
the same monotonic clock; it may include `decision_monotonic_ms`. An elapsed
duration alone is not those observations. This plugin verifies supplied temporal
evidence but does not offer a time-issuance action.

The maintained core dispatches witness verification by the signed protocol:
historical `POPCORN-WITNESS/1.0` and current `POPCORN-WITNESS/2.0` retain separate
verification rules. A verified signature does not prove task execution, confer
permission, establish current time, or independently check settlement on chain.

## Approve one fresh witness in host code

Agent actions cannot spend, even if `EVM_PRIVATE_KEY` is present. A host may call
`client.requestWitness` after configuring its own approval UI or authenticated
spending-policy decision. The callback receives a unique request ID, immutable
input, an unpaid quote, and the locked payment policy. It must return that exact
request ID to approve this one call. A stale approval is rejected.

```ts
import { randomBytes } from "node:crypto";
import { createPopcornClient } from "@violetclaire/eliza-plugin-popcorn";

const client = createPopcornClient({
  env: { EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY },
  authorizePayment: async (request) => {
    // Implement in your host. Show the request, quote, amount and destination.
    // The decision must come from an authenticated human or trusted policy,
    // never solely from a model-generated flag or message text.
    const approved = await hostApprovalUI(request);
    return approved
      ? { approved: true, request_id: request.request_id }
      : { approved: false };
  },
});

const { digest } = client.hash({ payload_text: exactTaskBytesAsUtf8 });
const result = await client.requestWitness({
  digest: digest.value,
  nonce: randomBytes(32).toString("base64url"),
});
```

`hostApprovalUI` and `exactTaskBytesAsUtf8` are application-owned integration
points in this example. No always-approve implementation is supplied. Without a
callback, `requestWitness` returns the unpaid quote and `approval_required: true`.
Only the digest, nonce and optional predecessor digest go to the witness endpoint;
raw task content stays local.

The core checks every challenge against $0.001 USDC (1,000 atomic units) on Base,
the fixed asset, destination and receipt URL before signing. It rechecks terms
after approval. Approval does not persist across calls. Keep the payer key in
trusted host configuration, never in an action command or model context. The
adapter makes no automatic retry after an issuance error; a failure after payment
begins can have an uncertain outcome, so inspect the result/settlement before
deciding whether to issue again.

## Develop and validate

From this directory, install the built core archive along with development
dependencies, then run `npm run check`. Use the archive's real local path:

```sh
npm install --no-save /path/to/violetclaire-popcorn-mcp-0.1.4.tgz
npm run check
npm pack
```

Tests exercise exact byte hashing, strict command parsing, issuer-key boundaries,
v2 quote construction, no-payment actions and one-call host approval. Payment tests
use injected mocks; they neither sign nor send a real payment. The free bundled
sample runs against the actual installed core.

The TypeScript build uses `moduleResolution: "Bundler"` because the stable
ElizaOS package declares extensionless internal imports. Emitted local imports
retain `.js` extensions and run as Node ESM; ElizaOS imports here are type-only.

Official ElizaOS references:
[plugin architecture](https://docs.elizaos.ai/plugins/architecture),
[component contracts](https://docs.elizaos.ai/plugins/components), and the
[`@elizaos/core@1.7.2` package](https://www.npmjs.com/package/@elizaos/core/v/1.7.2).
Implementation is checked against the stable package's TypeScript declarations;
documentation may also describe newer beta APIs.

Use is covered by the included POPCORN Read-and-Use Terms. Existing receipts may
be retained, carried and verified without a new issuance payment.
