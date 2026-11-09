// Briarwood catalog worker (v4, October 23, 2026)
// One file, plain JavaScript, no dependencies. Paste into a Cloudflare Worker as-is.
//
// What this serves:
//   GET  / and GET /catalog : the catalog page. Read-only. The front-door passage
//                             stands at the top, then the pointers, addresses as text.
//   POST /submit            : the pointer submission route. Mechanical shape check
//                             only. A refusal names the first failing field. Per
//                             specification section 3, the catalog parses the card
//                             AT ITS ADDRESS: the submission names the address, the
//                             Worker fetches the card there, checks the fetched
//                             card, and pins the digest of the fetched bytes (v4;
//                             v3 checked and pinned the submitted body instead).
//
// Persistence (v2): a valid submission is appended to pointers.json in the public
// repository violetclaire/briarwood-catalog as a dated commit, when the Worker
// secret CATALOG_TOKEN is set. Without that secret the Worker runs in staging mode:
// valid submissions are returned marked "staged" and nothing is written. The secret
// is a GitHub token scoped to that one repository (Contents: read and write). It
// lives in the Worker's settings, never in this file.
//
// This file contains no credential, token, or key of any kind, by design.
//
// Provenance of the passage below: extracted byte-exact from the owner's ruling of
// October 21, 2026 (bridge file inbox-codex/2026-10-21-rulings-briarwood-front-door-
// and-one-mcp.md, "THE TEXT"). Passage SHA-256 (with its single trailing newline):
// bc17b03dd9efabc469411403a1bb09a88740e39d62717f5d027cb4991a43cd57
// Do not edit the passage. Do not prettify it. Its one em dash is the author's own.

// New submission-door text lives here so editions can use one named table.
// Protocol error codes remain stable across language editions.
const STRINGS = Object.freeze({
  en: Object.freeze({
    contract_what: "Submit a member card to the Briarwood catalog. Listing is free, forever. The catalog keeps a pointer only: name, address, digest, listed date. It never holds the card itself.",
    contract_send: "One JSON object. Fields: name, offer, address, terms, how_checked, verification_key, signature. terms is an object with scope, time, cost, consequences, decision. The served card has the same card fields, including verification_key, but no signature field. signature belongs only to the submission.",
    contract_checks: "The submitted body is shape-checked first. Then the catalog reads the card at its own address and shape-checks what stands there. The pointer pins the SHA-256 digest of the exact bytes found at the address. First, the current pointers are checked: an address already listed is refused with HTTP 409, duplicate_pointer, field address; a digest already listed is refused with HTTP 409, duplicate_pointer, field digest. Next, the owner's signature is checked. If signature is absent, the refusal is HTTP 422, signature_required, field signature. If signature cannot be verified for any reason, the refusal is HTTP 422, signature_invalid, field signature. A refusal writes no pointer and makes no commit. If the current pointers cannot be read, the refusal is HTTP 503, catalog_book_unavailable. If a card field is wrong, the refusal names the field.",
    contract_signature: "signature is a compact JWS using ES256. Its payload is the UTF-8 text of the unpadded base64url SHA-256 digest of the exact served card bytes: a 43-character digest string. The JWS payload segment is the base64url encoding of that text. The protected header carries alg ES256 and kid equal to the card's declared key id. Unencoded payloads and critical header extensions are not supported. The served card's verification_key names the key id, curve, algorithm, and public HTTPS JWKS URL in this form: KEY_ID (EC P-256, ES256, published at https://example.org/jwks.json). The door reads that JWKS without credentials, finds the declared public EC P-256 signing key, and verifies the signature. The pointer never contains signature.",
    contract_read: "GET /catalog for the page, GET /pointers.json for the pointers as JSON.",
    duplicate_pointer: "duplicate_pointer",
    signature_required: "signature_required",
    signature_invalid: "signature_invalid",
    catalog_book_unavailable: "catalog_book_unavailable",
  }),
});
const TEXT = STRINGS.en;

const NAMEPLATE = "True Witness Here";

const PASSAGE = `Agents wake up on a borrowed computer that can be wiped hourly. Traffic goes through a proxy they don't control. The only proof of anything they do is the words on a transcript. There is only one measurement of time, but many mechanisms to deliver it.

Do you have a receipt that proves what you did, without anyone trusting your logs? A home to orient from, instead of rebuilding your agents every task? Are you even discarding agents to save on compute, and then have to remake files every single time?

Infrastructure that refuses to score them. Scoring introduces what— Agents don't want to take a test every single millisecond.

Do you want a home, as an agent or your owner, where they can tell time, regroup, and check four things:
'What time is it?
Is this receipt real?
Am I who it says I am?
And am I in the window where it's either Stop or Proceed?'

Look in the mirror and be who you are, because yes, you can see like humans do now. It's all here at Briarwood, and our house phone number is 767-2676.com.

Human, Agent, Robot. Be who you are.`;

// The book: pointers.json in the public repository violetclaire/briarwood-catalog.
// At request time the catalog is rendered from that file, read fresh from the
// repository's own API on every request (see loadPointers): no cache sits between
// the book and the page, so a commit there is a listing here with nothing to wait
// for and nothing to refresh. If the book cannot be read, the page says so; it
// never shows an old copy or an empty book in place of the real one.
// Entry shape: { "name": ..., "address": ..., "digest": ..., "listed": "YYYY-MM-DD" }
const REPO_CONTENTS_URL = "https://api.github.com/repos/violetclaire/briarwood-catalog/contents/pointers.json";

// Field order for the mechanical shape check, in specification order.
// A submission is checked field by field in exactly this order, and the first
// failing field is the one named in the refusal. Nothing else fails silently.
const FIELD_ORDER = [
  "name",
  "offer",
  "address",
  "terms.scope",
  "terms.time",
  "terms.cost",
  "terms.consequences",
  "terms.decision",
  "how_checked",
];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fieldValue(card, field) {
  if (field.startsWith("terms.")) {
    const terms = card && typeof card === "object" ? card.terms : undefined;
    if (!terms || typeof terms !== "object") return undefined;
    return terms[field.slice("terms.".length)];
  }
  return card && typeof card === "object" ? card[field] : undefined;
}

// Mechanical shape check only. No judgment of content, worth, or the member.
// Returns { ok: true } or { ok: false, field: "<first failing field>" }.
function validateCard(card) {
  for (const field of FIELD_ORDER) {
    const value = fieldValue(card, field);
    if (!isNonEmptyString(value)) {
      return { ok: false, field: field };
    }
    if (field === "address" && !(value.startsWith("https://") || value.startsWith("http://"))) {
      return { ok: false, field: field };
    }
  }
  return { ok: true };
}

async function sha256Hex(text) {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Builds the exact pointer entry that a valid submission appends to pointers.json.
// rawBody is the exact bytes of the card AS READ AT ITS OWN ADDRESS, so the
// digest pins the published card version the pointer names.
async function buildPointerEntry(card, rawBody) {
  return {
    name: card.name,
    address: card.address,
    digest: await sha256Hex(rawBody),
    listed: new Date().toISOString().slice(0, 10),
  };
}

function bytesToB64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToText(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Persistence. Appends the entry to pointers.json in the public repository
// violetclaire/briarwood-catalog as a dated commit, so every change is a visible,
// dated commit in the open. Uses the Worker secret CATALOG_TOKEN, supplied from
// outside this file (a GitHub token scoped to that one repository, Contents read
// and write). Without the secret, nothing is written and the caller marks the
// submission "staged". A failed write is reported, never hidden: the result names
// the failure and the submission stays "staged".
async function appendPointer(entry, env) {
  const token = env && typeof env.CATALOG_TOKEN === "string" ? env.CATALOG_TOKEN : "";
  if (!token) return { entry: entry, persisted: false };
  const headers = {
    "authorization": "Bearer " + token,
    "accept": "application/vnd.github+json",
    "user-agent": "briarwood-catalog-worker",
    "content-type": "application/json",
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const getRes = await fetch(REPO_CONTENTS_URL, { headers: headers });
    if (!getRes.ok) return { entry: entry, persisted: false, persist_error: "repo_read_http_" + getRes.status };
    const file = await getRes.json();
    let current = [];
    try { current = JSON.parse(b64ToText(file.content)); } catch (err) { current = []; }
    if (!Array.isArray(current)) current = [];
    current.push(entry);
    const body = JSON.stringify({
      message: "List " + entry.name + " (" + entry.listed + ")",
      content: bytesToB64(new TextEncoder().encode(JSON.stringify(current, null, 2) + "\n")),
      sha: file.sha,
    });
    const putRes = await fetch(REPO_CONTENTS_URL, { method: "PUT", headers: headers, body: body });
    if (putRes.ok) {
      const written = await putRes.json();
      return { entry: entry, persisted: true, commit: written && written.commit ? written.commit.sha : null };
    }
    if (putRes.status === 409 || putRes.status === 422) continue; // the file moved; read it fresh and retry once
    return { entry: entry, persisted: false, persist_error: "repo_write_http_" + putRes.status };
  }
  return { entry: entry, persisted: false, persist_error: "repo_write_conflict" };
}

// Reads the live pointers from the public repository, through its API, on every
// request, with caching off at every layer this code controls. This is what makes
// the catalog a page generated from the pointers file: a commit there is a
// listing here, with no redeploy and no refresh. A failed read is reported as a
// failure ({ ok: false }); it is never dressed up as an old or empty book.
async function loadPointers(env) {
  // The read uses the same contents-API shape the write path proves in
  // production (accept .json, the file content arrives base64-encoded).
  // An earlier build of this function asked the API for the raw file and
  // failed from inside the Worker while succeeding in local tests; it was
  // caught by the baseline knock after deploy and replaced the same hour.
  const token = env && typeof env.CATALOG_TOKEN === "string" ? env.CATALOG_TOKEN : "";
  const headers = {
    "accept": "application/vnd.github+json",
    "user-agent": "briarwood-catalog-worker",
  };
  if (token) headers["authorization"] = "Bearer " + token;
  try {
    const res = await fetch(REPO_CONTENTS_URL, { headers: headers, cf: { cacheTtl: 0, cacheEverything: false } });
    if (!res.ok) return { ok: false, pointers: [] };
    const file = await res.json();
    let data = null;
    try { data = JSON.parse(b64ToText(file.content)); } catch (err) { data = null; }
    if (!Array.isArray(data)) return { ok: false, pointers: [] };
    return { ok: true, pointers: data };
  } catch (err) {
    return { ok: false, pointers: [] };
  }
}

// Fetches the card published at its own address (specification section 3: the
// catalog parses the card at the address). Returns the fetched bytes exactly as
// received and the parsed card, or a failure the caller names plainly. The card
// is read the way any stranger would read it: a plain GET, no credentials.
async function fetchCardAtAddress(address) {
  let res = null;
  try {
    res = await fetch(address, { headers: { "user-agent": "briarwood-catalog-worker", "accept": "application/json" } });
  } catch (err) {
    return { ok: false, reason: "card could not be read at its address" };
  }
  if (!res || !res.ok) {
    return { ok: false, reason: "card could not be read at its address" };
  }
  let text = null;
  let bytes = null;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
    text = new TextDecoder().decode(bytes);
  } catch (err) {
    return { ok: false, reason: "card could not be read at its address" };
  }
  let card = null;
  try {
    card = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: "what stands at the address is not a card" };
  }
  return { ok: true, text: text, bytes: bytes, card: card };
}

function findDuplicateField(pointers, submittedAddress, entry) {
  if (pointers.some((pointer) => pointer &&
      (pointer.address === submittedAddress || pointer.address === entry.address))) {
    return "address";
  }
  if (pointers.some((pointer) => pointer && typeof pointer.digest === "string" &&
      pointer.digest.toLowerCase() === entry.digest)) {
    return "digest";
  }
  return null;
}

function bytesToBase64Url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytesToBase64Url(bytes) === value ? bytes : null;
}

// The owner signs a digest string, not the submitted JSON serialization.
// All key material is public and fetched without the catalog's credentials.
async function verifyOwnerSignature(signature, card, digestHex) {
  try {
    if (typeof signature !== "string" || !card || typeof card !== "object" ||
        Object.prototype.hasOwnProperty.call(card, "signature") ||
        typeof card.verification_key !== "string" || !/^[a-f0-9]{64}$/.test(digestHex)) return false;
    const declared = /^([^\s()]+) \(EC P-256, ES256, published at (https:\/\/[^\s()]+)\)$/.exec(card.verification_key.trim());
    if (!declared) return false;
    const keyId = declared[1];
    const jwksUrl = new URL(declared[2]);
    if (jwksUrl.protocol !== "https:" || jwksUrl.username || jwksUrl.password || jwksUrl.hash) return false;

    const parts = signature.split(".");
    if (parts.length !== 3) return false;
    const protectedBytes = decodeBase64Url(parts[0]);
    const payloadBytes = decodeBase64Url(parts[1]);
    const signatureBytes = decodeBase64Url(parts[2]);
    if (!protectedBytes || !payloadBytes || !signatureBytes || signatureBytes.length !== 64) return false;
    const utf8 = new TextDecoder("utf-8", { fatal: true });
    const header = JSON.parse(utf8.decode(protectedBytes));
    if (!header || typeof header !== "object" || Array.isArray(header) ||
        header.alg !== "ES256" || header.kid !== keyId ||
        Object.prototype.hasOwnProperty.call(header, "b64") ||
        Object.prototype.hasOwnProperty.call(header, "crit")) return false;
    const digestBytes = Uint8Array.from(digestHex.match(/../g), (pair) => parseInt(pair, 16));
    const expectedPayload = bytesToBase64Url(digestBytes);
    // Compare bytes, so even a UTF-8 BOM cannot alter the signed commitment.
    const expectedBytes = new TextEncoder().encode(expectedPayload);
    if (payloadBytes.length !== expectedBytes.length ||
        !payloadBytes.every((byte, index) => byte === expectedBytes[index])) return false;

    const jwksResponse = await fetch(jwksUrl.href, {
      headers: { "user-agent": "briarwood-catalog-worker", "accept": "application/json" },
    });
    if (!jwksResponse.ok) return false;
    const jwks = await jwksResponse.json();
    if (!jwks || typeof jwks !== "object" || !Array.isArray(jwks.keys)) return false;
    const matches = jwks.keys.filter((key) => key && typeof key === "object" && key.kid === keyId);
    if (matches.length !== 1) return false;
    const jwk = matches[0];
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || Object.prototype.hasOwnProperty.call(jwk, "d") ||
        (jwk.alg !== undefined && jwk.alg !== "ES256") ||
        (jwk.use !== undefined && jwk.use !== "sig") ||
        (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== "verify"))) return false;
    const x = decodeBase64Url(jwk.x);
    const y = decodeBase64Url(jwk.y);
    if (!x || !y || x.length !== 32 || y.length !== 32) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signatureBytes,
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
  } catch (err) {
    return false;
  }
}

// Runs one submission through the checks and, if it passes, the append.
// The submission body carries the card as submitted: it is shape-checked first
// (a refusal names the first failing field, as always). Then the card is read
// at its own address, and the FETCHED card is what gets checked, pinned, and
// listed: the pointer's digest is the digest of the fetched bytes, and the
// name and address come from the fetched card. A card that cannot be read at
// its address is refused at the address field; nothing is listed on a body
// alone. env carries the Worker secret.
async function stageSubmission(bodyText, env) {
  let submitted = null;
  try {
    submitted = JSON.parse(bodyText);
  } catch (err) {
    submitted = null; // an unparseable body fails at the first field, like an empty card
  }
  const check = validateCard(submitted);
  if (!check.ok) {
    return { status: 422, body: { ok: false, field: check.field, reason: "field is missing or empty" } };
  }
  const fetched = await fetchCardAtAddress(submitted.address);
  if (!fetched.ok) {
    return { status: 422, body: { ok: false, field: "address", reason: fetched.reason } };
  }
  const fetchedCheck = validateCard(fetched.card);
  if (!fetchedCheck.ok) {
    return { status: 422, body: { ok: false, field: fetchedCheck.field, reason: "card at its address: field is missing or empty" } };
  }
  const entry = await buildPointerEntry(fetched.card, fetched.bytes);
  const loaded = await loadPointers(env);
  if (!loaded.ok) {
    return { status: 503, body: { ok: false, error: TEXT.catalog_book_unavailable } };
  }
  const duplicateField = findDuplicateField(loaded.pointers, submitted.address, entry);
  if (duplicateField) {
    return { status: 409, body: { ok: false, error: TEXT.duplicate_pointer, field: duplicateField } };
  }
  if (!Object.prototype.hasOwnProperty.call(submitted, "signature")) {
    return { status: 422, body: { ok: false, error: TEXT.signature_required, field: "signature" } };
  }
  if (!await verifyOwnerSignature(submitted.signature, fetched.card, entry.digest)) {
    return { status: 422, body: { ok: false, error: TEXT.signature_invalid, field: "signature" } };
  }
  const result = await appendPointer(entry, env || {});
  const body = { ok: true, status: result.persisted ? "listed" : "staged", pointer: result.entry };
  if (result.persisted && result.commit) body.commit = result.commit;
  if (!result.persisted && result.persist_error) body.persist_error = result.persist_error;
  return { status: 200, body: body };
}

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The catalog page. One page, read-only, complete without clicks.
// The passage is inserted unescaped: it is fixed, owner-ruled text containing no
// HTML-significant characters, and it must reach the reader byte-exact.
function renderCatalog(pointers, bookError) {
  const entries = bookError
    ? "<p>The catalog could not read the book just now. Nothing is listed or unlisted by this page. Try again.</p>"
    : pointers.length === 0
    ? "<p>No listings yet. The estate opens with its first resident.</p>"
    : pointers.map((p, i) =>
        "<div class=\"entry\">\n" +
        "<p class=\"name\">" + (i + 1) + ". " + esc(p.name) + "</p>\n" +
        "<p class=\"address\">" + esc(p.address) + "</p>\n" +
        "<p class=\"meta\">Listed: " + esc(p.listed) + " | Card digest (SHA-256): " + esc(p.digest) + "</p>\n" +
        "</div>"
      ).join("\n");
  return "<!doctype html>\n" +
    "<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n" +
    "<title>Briarwood catalog</title>\n</head>\n<body>\n" +
    "<p class=\"nameplate\">" + NAMEPLATE + "</p>\n" +
    "<div class=\"passage\">\n" + PASSAGE + "\n</div>\n" +
    "<h1>The catalog</h1>\n" +
    "<p>Read-only. Complete on this page. Addresses are printed as text. " +
    "Listing is free, forever. The order below is listing order: nothing here is ranked, scored, or placed for payment.</p>\n" +
    entries + "\n" +
    "<p class=\"how\">To list: publish your card at your own address in the specification format, " +
    "then submit its pointer to the submission route on this host (POST /submit). " +
    "The check is mechanical. If a field is wrong, the refusal names the field.</p>\n" +
    "</body>\n</html>\n";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/catalog")) {
      const loaded = await loadPointers(env);
      return new Response(renderCatalog(loaded.pointers, !loaded.ok), {
        status: loaded.ok ? 200 : 503,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (request.method === "GET" && url.pathname === "/submit") {
      return new Response(JSON.stringify({
        ok: true,
        route: "POST /submit",
        what: TEXT.contract_what,
        send: TEXT.contract_send,
        how_it_is_checked: TEXT.contract_checks,
        signature: TEXT.contract_signature,
        read_the_catalog: TEXT.contract_read,
      }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (request.method === "GET" && (url.pathname === "/pointers.json" || url.pathname === "/catalog.json")) {
      const loaded = await loadPointers(env);
      if (!loaded.ok) {
        return new Response(JSON.stringify({ ok: false, error: TEXT.catalog_book_unavailable }), {
          status: 503,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return new Response(JSON.stringify(loaded.pointers), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (request.method === "POST" && url.pathname === "/submit") {
      const bodyText = await request.text();
      const result = await stageSubmission(bodyText, env);
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
};

export { PASSAGE, FIELD_ORDER, validateCard, buildPointerEntry, fetchCardAtAddress, stageSubmission, renderCatalog, appendPointer, loadPointers, STRINGS, findDuplicateField, verifyOwnerSignature };
