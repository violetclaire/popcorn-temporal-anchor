// Bundled into the Worker by build.mjs. No network or persistent storage here.
export const TAIN_ORIGIN = 'https://767-2676.com';
export const TAIN_LOOKUP_PREFIX = '/v1/receipt/tain/';
export const TAIN_LICENSE_PATH = '/license/contribution/1.0';
export const TAIN_LICENSE_URI = TAIN_ORIGIN + TAIN_LICENSE_PATH;
export const TAIN_LICENSE_DIGEST = 'cR0ghOOH6DG3SEeoYxPw1b38oL2wf2IjTazGSxi-vIY';
export const TAIN_LICENSE_TEXT = "POPCORN Contribution License 1.0\n\nThis license accompanies a POPCORN witness receipt identified by its Temporal\nAnchor Issuance Number (TAIN). The receipt is evidence that a payload digest\nwas witnessed at a stated time by a stated node. It is not a token, credit,\nidentity credential, or authorization.\n\n1. Attribution. Any system that presents, relays, or relies on the receipt\nmust attribute issuance to the POPCORN node named in the receipt's\nissuing_origin, and must reproduce the TAIN unchanged.\n\n2. Permitted use. The holder may use the receipt to prove that the digest it\ncommits to was witnessed at the stated time, to link it into a predecessor\nchain, and to present it to counterparties, agents, or auditors. The holder\nmay copy and transmit the receipt freely.\n\n3. Prohibited use. The holder may not alter any signed field, present the\nreceipt as proof of caller identity, delivery, execution, truth, legality, or\npermission, or represent the receipt as an authorization or instruction.\n\n4. Success threshold and payment trigger. The witness fee is earned when the\nnode returns a signed receipt for a settled payment. No further performance\nis promised. Payment for the witness service is triggered by the x402\nsettlement that precedes issuance; the receipt is the deliverable.\n\n5. Calculation. Fees are denominated in USDC on the network named in the\nreceipt's payment context. The amount due per issuance is the amount\nadvertised by the node at the issuance endpoint at the time of the request.\n\n6. Exit. The holder may stop using the receipt at any time. The node may\nrotate its signing keys and publish revocation or key-compromise notices at\nits well-known key location. Verification against a rotated or revoked key\nis the verifier's responsibility under its local policy.\n\nThis is a draft instrument, not legal advice. Questions of enforceability\nare the reader's own.\n";
// The license bytes are pinned at build time.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const pattern = /^tain_[0-9A-HJKMNP-TV-Z]{26}$/;
const ledgerFields = ['tain', 'receipt_id', 'node_id', 'witnessed_at_utc', 'issued_at_utc', 'payment_identifier', 'payment_transaction', 'license_uri', 'license_terms_digest'];

function base32(value, width) {
  let n = BigInt(value);
  const out = Array(width).fill('0');
  for (let i = width - 1; i >= 0 && n > 0n; i--) {
    out[i] = alphabet[Number(n & 31n)];
    n >>= 5n;
  }
  if (n !== 0n) throw new RangeError('TAIN component exceeds its field width');
  return out.join('');
}

export function createTain(witnessedAtMs, random = crypto.getRandomValues(new Uint8Array(10))) {
  if (!Number.isSafeInteger(witnessedAtMs) || witnessedAtMs < 0) {
    throw new RangeError('witnessed_at_ms must be a non-negative safe integer');
  }
  if (!(random instanceof Uint8Array) || random.length !== 10) {
    throw new TypeError('TAIN random suffix must be 10 bytes');
  }
  let suffix = 0n;
  for (const byte of random) suffix = (suffix << 8n) | BigInt(byte);
  return 'tain_' + base32(BigInt(witnessedAtMs), 10) + base32(suffix, 16);
}

export function isTain(value) {
  return typeof value === 'string' && pattern.test(value);
}

export function tainTimestamp(value) {
  if (!isTain(value)) throw new TypeError('witness receipt tain is missing or malformed');
  let n = 0n;
  for (const digit of value.slice(5, 15)) n = (n << 5n) | BigInt(alphabet.indexOf(digit));
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError('TAIN timestamp exceeds safe integer range');
  return Number(n);
}

export function tainVerificationUri(tain) {
  if (!isTain(tain)) throw new TypeError('invalid_tain');
  return TAIN_ORIGIN + TAIN_LOOKUP_PREFIX + tain;
}

export function makeTainQrPayload(receipt) {
  if (!isTain(receipt.tain)) throw new TypeError('invalid_tain');
  return JSON.stringify({
    v: 1,
    tain: receipt.tain,
    license_uri: receipt.contribution_license_uri,
    terms_digest: receipt.license_terms_digest.value,
    verify_uri: receipt.tain_verification_uri
  });
}

export function makeTainLedgerRecord(receipt, issuedAtUtc) {
  return {
    tain: receipt.tain,
    receipt_id: receipt.receipt_id,
    node_id: receipt.node_id,
    witnessed_at_utc: receipt.witnessed_at_utc,
    issued_at_utc: issuedAtUtc,
    payment_identifier: receipt.payment_identifier,
    payment_transaction: receipt.payment_transaction,
    license_uri: receipt.contribution_license_uri,
    license_terms_digest: receipt.license_terms_digest
  };
}

export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected PNG Uint8Array');
  let output = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    output += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(output);
}

export function validateTainLedgerRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).sort().join(',') !== [...ledgerFields].sort().join(',')) return false;
  return isTain(record.tain) && /^pwr_[0-9a-f]{32}$/.test(record.receipt_id) &&
    typeof record.node_id === 'string' && record.node_id.length > 0 && record.node_id.length <= 160 &&
    typeof record.witnessed_at_utc === 'string' && Number.isFinite(Date.parse(record.witnessed_at_utc)) &&
    new Date(record.witnessed_at_utc).toISOString() === record.witnessed_at_utc &&
    tainTimestamp(record.tain) === Date.parse(record.witnessed_at_utc) &&
    typeof record.issued_at_utc === 'string' && Number.isFinite(Date.parse(record.issued_at_utc)) &&
    new Date(record.issued_at_utc).toISOString() === record.issued_at_utc &&
    typeof record.payment_identifier === 'string' && /^eip3009_[0-9a-f]{64}$/.test(record.payment_identifier) &&
    (record.payment_transaction === null || (typeof record.payment_transaction === 'string' && record.payment_transaction.length > 0 && record.payment_transaction.length <= 256)) &&
    record.license_uri === TAIN_LICENSE_URI &&
    record.license_terms_digest?.algorithm === 'sha-256' &&
    record.license_terms_digest?.value === TAIN_LICENSE_DIGEST &&
    Object.keys(record.license_terms_digest).sort().join(',') === 'algorithm,value';
}

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function renderTainLetterhead(record, qrBase64) {
  const found = Boolean(record);
  const tain = record?.tain || '';
  const verification = found ? tainVerificationUri(tain) : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${found ? esc(tain) : 'TAIN not found'} · 767-2676.com</title><style>body{margin:0;background:#0b3d2e;color:#f2efe3;font:16px/1.55 system-ui}main{max-width:780px;margin:auto;padding:clamp(24px,5vw,64px)}a{color:inherit}h1{overflow-wrap:anywhere}dl{display:grid;grid-template-columns:max-content 1fr;gap:.5rem 1rem}dd{margin:0;overflow-wrap:anywhere}.scope{border:1px solid currentColor;padding:1rem;margin-top:2rem}img{width:180px;height:180px;background:white;padding:8px}</style></head><body><main><p>767-2676.com · POPCORN-WITNESS/2.0</p><h1>${found ? esc(tain) : 'No issuance record found'}</h1>${found ? `<p><a href="${esc(verification)}">Copyable verification URI</a></p><dl><dt>Receipt ID</dt><dd>${esc(record.receipt_id)}</dd><dt>Node</dt><dd>${esc(record.node_id)}</dd><dt>Witnessed</dt><dd>${esc(record.witnessed_at_utc)}</dd><dt>Issued</dt><dd>${esc(record.issued_at_utc)}</dd><dt>Witness window</dt><dd>See the signed receipt for its exact interval.</dd><dt>Payment ID</dt><dd>${esc(record.payment_identifier.slice(0, 18))}…</dd><dt>License</dt><dd><a href="${esc(record.license_uri)}">POPCORN Contribution License 1.0</a></dd></dl>${qrBase64 ? `<p><img alt="TAIN verification QR" src="data:image/png;base64,${qrBase64}"></p>` : ''}` : '<p>A valid TAIN was supplied, but this node has no corresponding issuance metadata.</p>'}<section class="scope"><strong>Evidence boundary</strong><p>This record identifies a signed time-and-digest witness. It does not prove task execution, delivery, caller identity, or authorization. The exact witness window and commitment are in the signed receipt; independently verify its ES256 signature using the issuer’s trusted public key.</p></section></main></body></html>`;
}

const licenseBytes = new TextEncoder().encode(TAIN_LICENSE_TEXT);
const licenseDigestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', licenseBytes));
const actualLicenseDigest = btoa(String.fromCharCode(...licenseDigestBytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
if (actualLicenseDigest !== TAIN_LICENSE_DIGEST) throw new Error('TAIN license digest mismatch at Worker startup');
export const TAIN_LICENSE_BYTES = licenseBytes;
