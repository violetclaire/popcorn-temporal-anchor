import {canonical,digest,digestBytes,decode64,parseAction,validate,fail} from './model.js';

// This prepares an immutable candidate. Only executor.mjs can append it to the
// resource transaction after rechecking identity, evidence, scope and time.
export async function prepareCommitment(actionBytes) {
  const action = parseAction(actionBytes);
  const canonicalDigest = await digest(action);
  const exactDigest = await digestBytes(decode64(actionBytes));
  if (canonicalDigest !== exactDigest) fail('changed_action_bytes');
  const checked = validate(action);
  if (!checked.valid) throw Object.assign(new Error(checked.issues[0].message), {code:'action_invalid',issues:checked.issues});
  const commitment = {
    action,
    input_digest:{algorithm:'sha-256',value:exactDigest},
    parameters:checked.parameters,
    assignments:checked.assignments,
    price_basis:checked.price_basis,
    evidence:checked.evidence
  };
  const freeze = value => { if (value && typeof value === 'object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value; };
  return freeze(JSON.parse(canonical(commitment)));
}
