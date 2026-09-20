import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.dirname(fileURLToPath(import.meta.url));
const repo = root;
const source = fs.readFileSync(path.join(repo, 'verify/typescript/src/index.ts'), 'utf8');
const maintained = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64'));
const browser = await import(pathToFileURL(path.join(out, 'verifier.mjs')).href);
const { evaluateSelection } = await import(pathToFileURL(path.join(out, 'model.mjs')).href);
const { evidence } = await import(pathToFileURL(path.join(out, 'evidence.mjs')).href);
const { humanView } = await import(pathToFileURL(path.join(out, 'presentation.mjs')).href);
const ledger = JSON.parse(fs.readFileSync(path.join(out, 'sources.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [name, digest] of Object.entries(ledger.sources)) assert.equal(hash(fs.readFileSync(path.join(repo, name))), digest, name);
for (const [name, digest] of Object.entries(ledger.outputs)) assert.equal(hash(fs.readFileSync(path.join(out, name))), digest, name);
assert(fs.readFileSync(path.join(out, 'verifier.mjs'), 'utf8').endsWith(stripTypeScriptTypes(source, { mode: 'transform' })), 'Maintained verifier was changed');
const savedFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Network prohibited'); };
const rows = [];
try {
  for (const recordIndex of [0, 1]) for (const taskChanged of [false, true]) for (const signatureChanged of [false, true]) {
    const packet = evidence.records[recordIndex].packet;
    const original = Buffer.from(packet.exact_schedule.bytes, 'base64url');
    const received = Buffer.from(taskChanged ? packet.expected_verification.one_byte_tamper.tampered_bytes : packet.exact_schedule.bytes, 'base64url');
    const candidate = structuredClone(packet.paid_evidence);
    if (signatureChanged) { const parts = candidate.witness_attestation.compact_jws.split('.'); const sig = Buffer.from(parts[2], 'base64url'); sig[0] ^= 1; parts[2] = sig.toString('base64url'); candidate.witness_attestation.compact_jws = parts.join('.'); }
    const opts = { expected_payload: received, expected_nonce: packet.submitted_request.nonce, expected_node_id: '767-2676.com', max_clock_accuracy_radius_ms: 10000 };
    const jwks = { keys: [packet.public_verification_key] };
    let nodeResult, browserResult, nodeError, browserError;
    try { nodeResult = await maintained.verifyPopcornWitnessEvidence(candidate, jwks, opts); } catch (error) { nodeError = error.message; }
    try { browserResult = await browser.verifyPopcornWitnessEvidence(candidate, jwks, opts); } catch (error) { browserError = error.message; }
    assert.deepEqual(browserResult, nodeResult);
    assert.equal(browserError, nodeError);
    const actual = await evaluateSelection({ recordIndex, taskChanged, signatureChanged });
    const view = humanView(actual);
    assert(view.verdict.includes(actual.decision), 'Human and machine decisions differ');
    assert(view.checks.includes('signature_verified: ' + actual.signatureVerified));
    assert(view.checks.includes('payload_digest_matches: ' + actual.digestMatches));
    assert(view.checks.includes('time_trusted: ' + actual.timingTrusted));
    assert.equal(actual.signatureVerified, !signatureChanged);
    assert.equal(actual.digestMatches, !taskChanged);
    assert.equal(actual.cryptographicVerified, !taskChanged && !signatureChanged);
    assert.equal(actual.receivedDigest, createHash('sha256').update(received).digest('base64url'));
    assert.equal(actual.exactTask.base64url, original.toString('base64url'));
    assert.equal(actual.receivedTask.base64url, received.toString('base64url'));
    assert.equal(actual.compactJws, candidate.witness_attestation.compact_jws);
    assert.equal(actual.authorizationGranted, false);
    assert.equal(actual.actionExecutionProven, false);
    if (signatureChanged) {
      assert.equal(actual.code, 'signature_invalid');
      assert.equal(actual.witnessedAt, null);
      assert.equal(actual.witnessInterval, null);
      assert.equal(actual.timingTrusted, false);
      assert.equal(actual.commitmentTrusted, false);
    } else if (taskChanged) assert.equal(actual.code, 'task_digest_mismatch');
    else {
      const judgment = maintained.evaluateWitnessAgainstSchedule(nodeResult.witness_window_utc, JSON.parse(original.toString()).execution_window_utc);
      assert.equal(actual.evaluatorDecision, judgment.decision);
      assert.equal(actual.code, judgment.reason);
      assert.equal(actual.decision.toLowerCase(), evidence.records[recordIndex].publishedOutcome.local_policy_outcome);
    }
    assert.equal(actual.decision, !taskChanged && !signatureChanged && recordIndex === 1 ? 'PROCEED' : 'STOP');
    rows.push({ recordIndex, taskChanged, signatureChanged, decision: actual.decision, code: actual.code });
  }
  const p = evidence.records[1].packet;
  const jwks = { keys: [p.public_verification_key] };
  const options = { expected_payload: Buffer.from(p.exact_schedule.bytes, 'base64url'), expected_nonce: p.submitted_request.nonce, max_clock_accuracy_radius_ms: 10000 };
  for (const verifier of [maintained, browser]) {
    await assert.rejects(verifier.verifyPopcornWitnessEvidence(p.paid_evidence, { keys: [] }, options), /absent from JWKS/);
    await assert.rejects(verifier.verifyPopcornWitnessEvidence(p.paid_evidence, jwks, { ...options, expected_nonce: undefined }), /nonce/);
    await assert.rejects(verifier.verifyPopcornWitnessEvidence(p.paid_evidence, jwks, { ...options, expected_payload: undefined }), /exactly one/);
    await assert.rejects(verifier.verifyPopcornWitnessEvidence(p.paid_evidence, jwks, { ...options, max_clock_accuracy_radius_ms: 0 }), /clock accuracy exceeds local policy/);
    const forged = structuredClone(p.paid_evidence); forged.witness_receipt.witnessed_at_utc = '2026-09-19T00:00:00.000Z';
    await assert.rejects(verifier.verifyPopcornWitnessEvidence(forged, jwks, options), /does not equal the signed payload/);
    const bom = structuredClone(p.paid_evidence); const parts = bom.witness_attestation.compact_jws.split('.');
    parts[0] = Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(parts[0], 'base64url')]).toString('base64url');
    bom.witness_attestation.compact_jws = parts.join('.');
    await assert.rejects(verifier.verifyPopcornWitnessEvidence(bom, jwks, options), /not valid base64url JSON/);
  }
  for (const input of [null, [], { recordIndex: 2 }, { recordIndex: '1' }, { taskChanged: 1 }, { signatureChanged: 'false' }, { extra: true }]) await assert.rejects(evaluateSelection(input), TypeError);
  const defaultResult = await evaluateSelection();
  assert.equal(defaultResult.decision, 'PROCEED');
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const embedded = html.match(/<script type="application\/json" id="verification-result">([\s\S]*?)<\/script>/);
  assert(embedded, 'Missing machine-readable default result');
  assert.deepEqual(JSON.parse(embedded[1]), defaultResult, 'Rendered default differs from shared model result');
  assert(Object.isFrozen(evidence.records[1].packet.paid_evidence.witness_receipt));
  const savedBuffer = globalThis.Buffer;
  try { globalThis.Buffer = undefined; assert.equal((await evaluateSelection()).cryptographicVerified, true); } finally { globalThis.Buffer = savedBuffer; }
  console.log(JSON.stringify({ passed: true, combinations: rows, strictVerifierCases: 12, invalidSelections: 7, worksWithoutGlobalBuffer: true, networkRequests: 0, maintainedVerifierEquivalent: true, sharedPresentationResult: true }));
} finally { globalThis.fetch = savedFetch; }
