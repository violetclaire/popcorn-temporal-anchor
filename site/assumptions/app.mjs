import { evaluateSelection } from './model.mjs';
import { humanView } from './presentation.mjs';
const get = id => document.getElementById(id);
const text = (id, value) => { get(id).textContent = String(value); };
const controlIds = ['record-index', 'task-changed', 'signature-changed'];
let revision = 0;
function controlLabels() {
  const labels = [Number(get('record-index').value) === 1 ? '002 / Checkpoint inside the window' : '001 / Checkpoint after the window closed', Number(get('task-changed').value) ? 'One task byte changed' : 'Exact agreed bytes', Number(get('signature-changed').value) ? 'One signature byte changed' : 'Original signature'];
  ['record-label', 'task-label', 'signature-label'].forEach((id, i) => { text(id, labels[i]); get(controlIds[i]).setAttribute('aria-valuetext', labels[i]); });
}
function writeMachine(result) {
  const json = JSON.stringify(result, null, 2);
  text('result-json', json);
  text('verification-result', json);
}
function pending() {
  get('results').setAttribute('aria-busy', 'true');
  text('check-status', 'Checking the selected task and receipt locally.');
  text('decision', 'STOP'); text('agent-decision', 'STOP');
  for (const id of ['human-agreement', 'human-window', 'human-time', 'human-interval', 'human-signature', 'human-digest', 'committed-digest', 'received-digest', 'signature-bytes', 'key-id', 'agent-interval', 'exact-task', 'received-task', 'received-base64', 'compact-jws']) text(id, 'Checking...');
  text('human-verdict', 'Verification is pending. No decision to proceed is available.');
  text('agent-checks', 'reason: verification_pending');
  writeMachine({ decision: 'STOP', reason: 'verification_pending', historical: true, authorizationGranted: false });
}
function render(result) {
  const view = humanView(result);
  text('decision', result.decision); text('agent-decision', result.decision);
  const values = { 'human-agreement': view.agreement, 'human-window': view.agreementWindow, 'human-time': view.witnessedAt, 'human-interval': view.interval, 'human-verdict': view.verdict, 'human-signature': view.signature, 'human-digest': view.digest, 'committed-digest': result.committedDigest, 'received-digest': result.receivedDigest, 'signature-bytes': result.signatureBase64url, 'key-id': result.keyId, 'agent-interval': view.agentInterval, 'agent-checks': view.checks, 'exact-task': result.exactTask.utf8, 'received-task': result.receivedTask.utf8, 'received-base64': result.receivedTask.base64url, 'compact-jws': result.compactJws };
  for (const [id, value] of Object.entries(values)) text(id, value);
  writeMachine(result);
  get('results').setAttribute('aria-busy', 'false');
  text('check-status', `Checked locally. ${result.decision} at the recorded checkpoint. No task executed.`);
}
async function update() {
  const current = ++revision;
  controlLabels(); pending();
  try {
    const result = await evaluateSelection({ recordIndex: Number(get('record-index').value), taskChanged: get('task-changed').value === '1', signatureChanged: get('signature-changed').value === '1' });
    if (current === revision) render(result);
  } catch (error) {
    if (current !== revision) return;
    get('results').setAttribute('aria-busy', 'false');
    text('check-status', 'Verification could not run. The result remains STOP.');
    text('human-verdict', 'This browser could not complete verification. STOP. The source evidence remains available below.');
    for (const id of ['human-agreement', 'human-window', 'human-time', 'human-interval', 'human-signature', 'human-digest', 'committed-digest', 'received-digest', 'signature-bytes', 'key-id', 'agent-interval', 'exact-task', 'received-task', 'received-base64', 'compact-jws']) text(id, 'Not verified');
    text('agent-checks', 'reason: verification_unavailable');
    writeMachine({ decision: 'STOP', reason: 'verification_unavailable', error: String(error?.message || error), historical: true, authorizationGranted: false });
  }
}
for (const id of controlIds) get(id).addEventListener('input', update);
get('reset').addEventListener('click', () => { get('record-index').value = '1'; get('task-changed').value = '0'; get('signature-changed').value = '0'; update(); });
update();
