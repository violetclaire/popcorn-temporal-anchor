export function humanView(result) {
  const instant = value => value ? value.replace('T', ' at ').replace('Z', ' UTC') : 'Not verified';
  const { opens_at, closes_at } = result.agreementInterval;
  let verdict;
  if (!result.signatureVerified) verdict = 'The signature does not check out. The receipt cannot establish the time for this check. STOP.';
  else if (!result.digestMatches) verdict = 'The signature checks out, but the received task bytes do not match the signed digest. These are not the same agreed bytes. STOP.';
  else if (!result.cryptographicVerified) verdict = 'The evidence did not pass every verification check. STOP.';
  else if (result.decision === 'STOP') verdict = 'The signature and task bytes check out, but the witness interval is outside the agreed window. STOP at this recorded checkpoint.';
  else verdict = 'The signature and task bytes check out. The whole witness interval falls inside the agreed window. PROCEED at this recorded checkpoint.';
  return {
    agreement: result.taskDescription.charAt(0).toUpperCase() + result.taskDescription.slice(1) + '.',
    agreementWindow: `Agreed window: ${instant(opens_at)} to ${instant(closes_at)}.`,
    witnessedAt: result.timingTrusted ? instant(result.witnessedAt) : 'Not verified.',
    interval: result.timingTrusted ? `Signed interval: ${instant(result.witnessInterval.earliest)} to ${instant(result.witnessInterval.latest)}.` : 'A time printed in a receipt is a claim until its signature verifies.',
    verdict,
    signature: result.signatureVerified ? 'Signature: checks out' : 'Signature: does not check out',
    digest: !result.digestMatches ? 'Task bytes: changed' : result.commitmentTrusted ? 'Task bytes: match' : 'Task bytes: match an untrusted digest',
    agentInterval: result.timingTrusted ? `${result.witnessInterval.earliest}\n${result.witnessInterval.latest}` : `UNTRUSTED CLAIM\n${result.claimedWitnessInterval.earliest}\n${result.claimedWitnessInterval.latest}`,
    checks: `signature_verified: ${result.signatureVerified}\npayload_digest_matches: ${result.digestMatches}\ncommitment_trusted: ${result.commitmentTrusted}\ntime_trusted: ${result.timingTrusted}\nreason: ${result.code}`,
  };
}
