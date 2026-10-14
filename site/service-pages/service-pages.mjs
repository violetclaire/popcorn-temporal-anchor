// Public document routes for integration into the existing production Worker.
// This module is not a standalone Worker and contains no payment or signing code.

const style = `
:root { font-family: Georgia, 'Times New Roman', serif; color: #142f26; background: #ecece4; }
* { box-sizing: border-box; }
body { margin: 0; }
.page { max-width: 64rem; margin: auto; padding: clamp(1.25rem, 4vw, 3rem); }
header, footer, nav { display: flex; flex-wrap: wrap; gap: 1rem; }
header, footer { padding: 1rem 0; border-bottom: 1px solid; font: 700 .8rem/1.5 Arial, sans-serif; }
header { justify-content: space-between; }
footer { border-top: 1px solid; border-bottom: 0; }
main { padding: 3rem 0; }
h1 { margin: .5rem 0 1.5rem; font-size: clamp(2.75rem, 7vw, 5rem); line-height: 1; font-weight: normal; }
h2 { font-size: 1.5rem; margin-top: 2.25rem; }
p, li { font-size: 1.08rem; line-height: 1.65; }
a { color: inherit; text-underline-offset: .2em; }
a:focus-visible { outline: 2px solid #6e2528; outline-offset: 4px; }
.eyebrow { color: #6e2528; font: 700 .8rem/1.5 Arial, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
.price { font-size: clamp(2rem, 6vw, 3.5rem); margin: 1rem 0; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font: 1rem/1.55 Arial, sans-serif; }
caption { text-align: left; padding-bottom: .75rem; font-weight: bold; }
th, td { padding: 1rem .65rem; text-align: left; vertical-align: top; border-bottom: 1px solid; }
th { background: #142f26; color: #ecece4; }
code { font-size: .9em; overflow-wrap: anywhere; }
li { margin-bottom: .5rem; }
@media (max-width: 36rem) { main { padding: 2rem 0; } th, td { padding: .75rem .4rem; } }
@media print { :root { background: white; color: black; } .page { max-width: none; } }
`;

function page(title, path, description, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | POPCORN | Briarwood AI</title>
<meta name="description" content="${description}">
<link rel="canonical" href="https://767-2676.com${path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${style}</style>
</head>
<body><div class="page">
<header><a href="/">Briarwood AI / POPCORN</a><nav aria-label="Main"><a href="/agents">For agents</a><a href="/pricing">Pricing</a><a href="/terms">Terms</a></nav></header>
<main>${body}</main>
<footer><a href="/llms.txt">Agent documentation</a><a href="/openapi.json">API specification</a><a href="mailto:violet@briarwood.ai">Contact Briarwood AI</a></footer>
</div></body>
</html>
`;
}

export const pricingHtml = page('Pricing', '/pricing',
  'POPCORN pricing: 0.001 USDC per signed time or payload witness request on Base through x402. Public documentation and sample verification are free.', `
<p class="eyebrow">POPCORN by Briarwood AI</p>
<h1>Pricing</h1>
<p class="price">0.001 USDC per request</p>
<p>Pay per request for signed time or a payload commitment witness. Payments use USDC on Base mainnet through x402 v2. No POPCORN subscription, account, or API key is required.</p>
<div class="table-wrap"><table>
<caption>Canonical paid services</caption>
<thead><tr><th scope="col">Service</th><th scope="col">What you receive</th><th scope="col">Price per request</th></tr></thead>
<tbody>
<tr><td>Signed time<br><code>GET /v1/time</code></td><td>A signed temporal anchor that a receiving system can independently verify.</td><td>0.001 USDC</td></tr>
<tr><td>Payload witness<br><code>POST /v1/receipt</code></td><td>A signed statement of when a SHA-256 digest commitment was presented, within the stated clock interval. Your original task bytes stay with you.</td><td>0.001 USDC</td></tr>
</tbody></table></div>
<p>1,000 separately paid requests cost 1 USDC in POPCORN service fees. Any fees charged separately by your wallet, network, or payment provider are outside this service price.</p>
<h2>Free to read and verify</h2>
<p>The <a href="/time">public clock</a>, <a href="/agents">agent guide</a>, <a href="/agent/offer">service offer</a>, <a href="/openapi.json">API specification</a>, and <a href="/.well-known/popcorn-keys.json">verification keys</a> are public. The <a href="https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/examples/witness">published historical samples</a> and <a href="https://github.com/violetclaire/popcorn-temporal-anchor/tree/main/verify">local verifiers</a> let you evaluate the proof without making a payment. Historical samples do not supply fresh time for a new task.</p>
<h2>Before authorizing payment</h2>
<p>An unpaid API request returns a <code>402 Payment Required</code> challenge describing the payment requirements. Reading that challenge does not transfer funds. Check its resource, amount, asset, network, and recipient before authorizing payment. If those requirements differ from this page or your approved spending limits, stop and resolve the difference.</p>
<p>The current amount is <code>1000</code> atomic USDC units, or <code>0.001</code> USDC, on <code>eip155:8453</code>. Payment purchases temporal evidence. Your application separately determines whether a task is authorized and whether it may proceed.</p>
<h2>Other documented routes</h2>
<p>The legacy <code>GET /time?format=json</code> alias and reference <code>POST /agent/handoff</code> route are also documented at 0.001 USDC per paid request in the <a href="/openapi.json">API specification</a>. The reference handoff validates a submitted task envelope; it is a separate contract from the digest-only witness and does not execute or deliver the task.</p>
<p>Read the <a href="/terms">service terms</a>. For pricing or billing questions, contact <a href="mailto:violet@briarwood.ai">violet@briarwood.ai</a>.</p>
`);

export const termsHtml = page('Service terms', '/terms',
  'POPCORN service terms from Briarwood AI: temporal evidence, payment authorization, verification responsibilities, data scope, and support.', `
<p class="eyebrow">POPCORN by Briarwood AI</p>
<h1>Service terms</h1>
<p>These terms describe use of the POPCORN service operated by Briarwood AI at <a href="https://767-2676.com">767-2676.com</a>. They apply to people and organizations using the service directly or through their agents.</p>
<h2>What the service provides</h2>
<p><code>GET /v1/time</code> provides signed temporal evidence. <code>POST /v1/receipt</code> provides a signed witness statement that a supplied SHA-256 digest commitment was presented within the stated clock interval. The <a href="/openapi.json">API specification</a> and <a href="https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/docs/WITNESS_PROTOCOL.md">witness protocol</a> define the response and signed scope.</p>
<p>A witness does not establish who approved a plan, whether its contents are true, whether another party received it, or whether an action happened. It does not grant authority, reserve availability, or prevent replay. The calling application is responsible for those checks and controls.</p>
<h2>Payment and agent authority</h2>
<p>Paid requests use x402 v2. Current service fees appear on the <a href="/pricing">pricing page</a>; each payment challenge identifies the requested resource and payment requirements. Authorize only payments you are entitled to make and that match your spending limits. A request for payment is not permission to spend.</p>
<p>Agents must operate within the authority their operator has granted. Payment to POPCORN does not authorize a downstream action or override another service's rules or access controls.</p>
<h2>Verification and reliance</h2>
<p>Before relying on evidence, verify the signature against a trusted public key, the signed fields, the expected digest and nonce where applicable, and the timing conditions relevant to your task. Applications retain responsibility for identity, consent, access control, duplicate prevention, and the decision to act.</p>
<p>A timestamp's precision is not a guarantee of clock accuracy. Assess the declared interval and clock policy. A historical witness is evidence about its recorded checkpoint, not proof of current availability or permission to act now. Another process must assess freshness for itself; copying a receipt does not transfer the original process's monotonic timer.</p>
<h2>Data submitted</h2>
<p>For <code>POST /v1/receipt</code>, hash your original bytes locally and submit only the fields permitted by the <a href="/schemas/witness-request.v1.json">witness request schema</a>: the digest, nonce, and optional predecessor digest. Keep the original task content in your own systems. Do not send passwords, private keys, or raw personal or confidential task content in a witness request.</p>
<p>The separate reference <code>POST /agent/handoff</code> route accepts a task envelope under its own API contract. The digest-only input description for <code>/v1/receipt</code> does not apply to that route. Blockchain payments have public transaction records; keeping task bytes local does not make the payment private.</p>
<h2>Use and support</h2>
<p>Use the service only for activity you are authorized to perform. Do not interfere with its operation or misrepresent what its evidence proves.</p>
<p>For service questions, billing errors, or a settled payment without a usable response, contact <a href="mailto:violet@briarwood.ai">violet@briarwood.ai</a>. Include the endpoint, approximate request time, and public transaction hash if available. Never send private keys, seed phrases, reusable payment authorizations, or unrelated personal information. Report security concerns privately to the same address.</p>
<p>A missing response alone does not establish whether payment settled. Check the payment status before authorizing another charge. These terms do not limit rights or remedies that applicable law makes non-waivable.</p>
`);

const documents = new Map([
  ['/pricing', pricingHtml], ['/pricing/', pricingHtml],
  ['/terms', termsHtml], ['/terms/', termsHtml],
]);

export function handleServiceDocument(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const body = documents.get(new URL(request.url).pathname);
  if (body === undefined) return null;
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    },
  });
}
