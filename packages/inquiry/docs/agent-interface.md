# Agent interface

The local agent driver exposes provider discovery and the inquiry lifecycle as
explicit machine-readable commands. It processes one UTF-8 JSON request per
line on stdin and writes one JSON reply per line to stdout, awaiting each
operation before reading the next command. Diagnostics use stderr.

This driver is a **participant-local process interface**, not a public RPC
server. Possession of its input stream is authority to request operations from
the installed participant. The process owner must isolate stdin, storage,
identities, keys, and configuration. An externally accessible service needs
its own authenticated caller boundary, request authorization, rate limits,
and data-access policy. Do not expose this process directly to a network socket.

## Run

Requires Node.js 20 or later and no additional dependencies. From this package:

```text
node bin/agent.mjs /absolute/path/to/trusted-local-config.mjs
```

The argument is a local module path. The driver resolves it to a `file:` URL
and imports it without executing a shell. **Configuration is trusted executable
code**, with the permissions of the Node process; never accept a config path
or source from an inquiry, provider listing, or an untrusted agent.

The module must default-export an async function returning:

```js
{
  participant,        // configured createParticipant(...) instance
  search: async query => searchProviders(candidateListings, query, {
    trust, asOf: new Date().toISOString(),
  }),
  inspect: async listingId => {
    // Find the exact signed listing in the locally configured candidate source.
    // Validate its signature, trust, validity interval, terms, and endpoint with
    // validateListing(envelope, { trust, asOf }) before returning it.
    // Throw a coded error when missing or invalid; do not trust listingId alone.
    return validatedSignedListing;
  },
}
```

This is the return-shape contract, not a ready-to-run configuration. The local
operator installs candidate sources, trust pins, the signing identity,
participant storage, an authorization policy, a clock, and witness, delivery,
payment, and completion adapters. No default remote endpoint, wallet, payment
authority, or signing key is supplied. The discovery function searches only
the supplied listings; discovering candidates elsewhere is the configured
source's responsibility. Public search results alone are not trusted participants.

`console.log`, `console.info`, and other standard console diagnostics from the
configuration and adapters are routed to stderr. Adapters must not write
directly to `process.stdout`, which is reserved for protocol replies.

## Requests and replies

```json
{"id":"methods","method":"tools.list","params":{}}
{"id":"find","method":"providers.search","params":{"query":{"capabilities":["research"],"text":"literature"}}}
{"id":"terms","method":"providers.inspect","params":{"listing_id":"provider-offer-1"}}
{"id":"check","method":"inquiry.status","params":{"inquiry_id":"inquiry-1"}}
```

A request has only `id`, `method`, and optional `params`. The correlation ID is
a nonempty string of at most 128 characters or a safe integer. Omitted params
are `{}`. No notifications, batches, dynamic method names, or shell commands
are supported. This framing is NDJSON; it is not JSON-RPC 2.0 or an MCP transport.

Success and failure use mutually exclusive fields:

```json
{"id":"find","result":{"matches":[],"rejected":[]}}
{"id":"check","error":{"code":"inquiry_not_found","message":"inquiry_not_found"}}
```

`result` is the configured operation's returned value; the driver does not
substitute an acknowledgment, rewrite lifecycle state, or trigger a next step.
An operation returning `undefined` is represented by JSON `null`.

## Available methods

`tools.list` returns the complete input schemas and explicit side-effect
metadata, including `maySpendFunds`, `mayChargeProvider`,
`mayChargeWitnessFee`, `changesState`, and `requiresExplicitAuthorization`.
Those fields describe operations; they do
not grant authority or replace the participant's authorization policy.

Witness creation can incur fees when the local operator installs a paid
POPCORN witness adapter. `inquiry.submit`, `inquiry.respond`, `terms.freeze`,
`payment.pay`, `payment.reconcile`, and `work.complete` therefore advertise
possible witness spending. `payment.pay` is the only method that initiates
provider payment. Reconciliation can witness a verified settlement without
charging the provider payment again. The configured authorization policy must
bound and authorize both provider charges and any witness fees before use.

| Method | Parameters | Operation |
| --- | --- | --- |
| `tools.list` | `{}` | List this interface's methods and input schemas. |
| `providers.search` | `{query:{capabilities:[...],text?}}` | Search the configured candidate listings; capability filters are exact and text narrows results. |
| `providers.inspect` | `{listing_id}` | Retrieve a validated signed listing and its terms through the configured callback. |
| `inquiry.submit` | `{envelope}` | Submit the requester-signed structured inquiry and return participant output, including the signed receipt when successful. |
| `inquiry.status` | `{inquiry_id}` | Read current state, receipt confirmation, events, and pending work. |
| `receipt.acknowledge` | `{ack}` | Verify and record the requester-signed receipt acknowledgment. |
| `receipt.retry` | `{inquiry_id}` | Retry receipt delivery under the participant's retry policy. |
| `notification.retry` | `{inquiry_id}` | Retry an optional notification through its separate bounded outbox. |
| `inquiry.respond` | `{inquiry_id,decision,reason?,referral?}` | Witness `accept`, `refer`, or `decline`. |
| `terms.freeze` | `{envelope}` | Verify the requester-signed agreement to freeze exact terms. |
| `payment.pay` | `{inquiry_id}` | Explicitly request payment using frozen terms and the configured payment adapter. May spend money. |
| `payment.reconcile` | `{inquiry_id}` | Resolve an existing payment attempt before further action. |
| `work.complete` | `{inquiry_id,result_digest,evidence}` | Record the provider's SHA-256 result digest and evidence object. |
| `work.close` | `{ack}` | Verify and record the requester-signed completion acknowledgment. |

Signed `envelope` and `ack` objects must meet the participant's protocol,
signature, identity, expiry, binding, and transition rules. The driver performs
framing and parameter checks; the participant owns cryptographic validation
and lifecycle decisions. `result_digest` contains 64 lowercase hexadecimal characters.
Referral parameters are an object with `destination` (a signed listing),
`authorization_ref`, and `expires_at`. The participant validates these fields,
the destination's trust, and the complete referral chain.

## Lifecycle and authority

1. Search, inspect exact terms, and construct the signed structured inquiry.
2. Submit the inquiry. Receipt creation and a successful transport call do
   **not** establish requester confirmation. Preserve and verify the signed
   receipt, then send a requester-signed `receipt.acknowledge` command.
3. If delivery or acknowledgment remains unconfirmed, inspect status and
   explicitly retry through `receipt.retry`. The driver has no background
   retry loop and does not silently close an open confirmation loop.
   Optional notifications use the separate `notification.retry` command. Their
   delivery status does not establish signed receipt confirmation, and the
   driver never starts a notification merely because submission succeeded.
4. Record acceptance, referral, or decline. For referral, retain the signed
   chain and carry it into the next structured inquiry to a validated provider.
5. After acceptance, authorize the signed agreement to freeze the exact terms.
6. Invoke `payment.pay` only with spending authorization. The configured
   participant and payment adapter enforce amount, payee, currency, network,
   idempotency, and confirmation policy. Unknown payment outcomes require
   reconciliation; transport errors do not authorize a second charge.
7. Record completion evidence, verify the result, and send the requester-signed
   completion acknowledgment using `work.close`.

No command automatically performs the next command. In particular, submission
does not acknowledge its own receipt, freezing terms does not initiate provider
payment, and recording completion does not invent requester acceptance. Witness
creation during a transition can still incur configured, authorized witness
fees. Local policies
must also govern provider commands such as response and completion; these are
not automatically authorized because an inquiry exists.

## Boundary limits and errors

Each input line is limited to 65,536 bytes excluding its newline. Lines above
the limit are discarded with bounded retained input and produce one
`REQUEST_TOO_LARGE` reply; parsing resumes after the next newline. The final
line can omit its newline. A blank line, invalid JSON, or invalid UTF-8 produces
`PARSE_ERROR`; malformed transport replies use `id: null`.

Request values must be JSON values with nesting of at most 24 levels, at most
8,192 visited values, arrays of at most 512 items, object keys of at most 256
characters, and strings of at most 32,768 characters. Individual method schemas
set narrower limits. Unknown fields and method names are rejected before
dispatch. Direct in-process callers receive the same checks; getters and
non-JSON objects are rejected.

Interface failures include `INVALID_REQUEST`, `INVALID_PARAMS`,
`METHOD_NOT_FOUND`, `METHOD_UNAVAILABLE`, and `REQUEST_TOO_LARGE`. Coded
participant errors are preserved. Unexpected uncoded failures become
`INTERNAL_ERROR` without stacks or private adapter details. Non-serializable
adapter output becomes `INVALID_RESULT`. A configuration or output-stream
failure goes to stderr and causes a nonzero exit status.

Error output does not establish that an attempted side effect was rolled back.
Inspect participant state and reconcile ambiguous outcomes using the original
inquiry and payment identifiers.

Run the transport and dispatch checks with:

```text
node --test test/agent.test.mjs
```

These checks use fake local adapters and make no network calls or payments.
