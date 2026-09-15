// Local integration example, Node 20+. No network, wallet, or witness issuance.
import { createHash } from 'node:crypto';
export const digest = bytes => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new TypeError('Nonempty exact task bytes required');
  return createHash('sha256').update(bytes).digest('base64url');
};

/** approval and checks MUST come from the receiver's trusted local adapters,
 * not the submitting agent, a receipt, or a public request body.
 * approval.exactTaskDigest binds the owner's approval to a complete task version.
 * checks refer to CURRENT owner authority, conditions/resources and time policy.
 * This helper does not verify signatures, interpret policies or execute work.
 */
export function checkTaskRevision({ acceptedBytes, proposedBytes, predecessorTaskDigest, approval, checks }) {
  let accepted, proposed;
  try { accepted = digest(acceptedBytes); proposed = digest(proposedBytes); }
  catch { return { action: 'STOP', reason: 'Invalid task bytes', execution_proven: false }; }
  const result = { accepted_task_digest: accepted, proposed_task_digest: proposed,
    changed: accepted !== proposed, execution_proven: false };
  if (result.changed && predecessorTaskDigest !== accepted)
    return { ...result, action: 'STOP', reason: 'Revision does not link to the accepted task' };
  if (!checks || !['authority', 'conditions', 'time'].every(key => checks[key] === true))
    return { ...result, action: 'STOP', reason: 'Required current checks have not all passed' };
  if (!approval || approval.decision !== 'approved' || approval.exactTaskDigest !== proposed)
    return { ...result, action: 'COUNTER', reason: 'Obtain approval for this exact task revision' };
  return { ...result, action: 'PROCEED', reason: 'Revision binding and supplied current checks pass' };
}
