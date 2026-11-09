import {canonical, digest, digestBytes, decode64, utf8, exactKeys, isDigest, isId, publicKey, verifySigned, authorizationDigest, fail} from './model.js';
import {prepareCommitment} from './publication.js';

// The only resource effect is an immutable checkpoint record. Neither a caller
// signature nor a witness is an authorization: an installed authority grants it.
// Clock bounds below are operator/issuer assertions, never measured accuracy.
const RESOURCE = 'popcorn-checkpoint-demo';
const EXECUTE_URI = 'https://767-2676.com/checkpoint/execute';
const WITNESS_PROTOCOL = 'POPCORN-WITNESS/2.0';
const GRANT_KEYS = ['type','authorization_id','action_id','action_kind','resource','input_digest','presenter','not_before','expires_at','clock','cost'];
const PRESENTATION_KEYS = ['type','authorization_id','authorization_digest','action_id','input_digest','nonce','audience'];
const PRE_KEYS = ['type','authorization_id','authorization_digest','authorization_expires_at','action_id','input_digest','nonce'];
const clone = value => JSON.parse(canonical(value));
const equal = (left, right) => canonical(left) === canonical(right);
const envelopeKeys = ['key_uri','compact_jws'];
const uri = value => typeof value === 'string' && value.length <= 2048 && value.startsWith('https://');
const recordKey = id => 'checkpoint:authorization:' + id;
const nonceKey = nonce => 'checkpoint:nonce:' + nonce;
const grantKey = id => 'checkpoint:grant:' + id;
class TransactionOutcomeUnknown extends Error {}
function requireKeys(value, keys, label) {
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    const missing = keys.find(key => !Object.hasOwn(value, key));
    if (missing) fail('incomplete, need ' + label + '.' + missing);
  }
  if (!exactKeys(value, keys)) fail(label + '_invalid');
}
function instant(value, label) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(time) || new Date(time).toISOString() !== value) fail(label + '_invalid');
  return time;
}
function nonce(value) {
  if (decode64(value).length !== 32) fail('nonce_invalid');
  return value;
}
function signedPayload(envelope, expectedUri, expectedTyp) {
  requireKeys(envelope, envelopeKeys, 'executor_signature');
  if (envelope.key_uri !== expectedUri || typeof envelope.compact_jws !== 'string') fail('executor_signature_invalid');
  const parts = envelope.compact_jws.split('.');
  if (parts.length !== 3 || decode64(parts[2]).length !== 64) fail('executor_signature_invalid');
  const decoder = new TextDecoder('utf-8', {fatal:true});
  const headerText = decoder.decode(decode64(parts[0]));
  const payloadText = decoder.decode(decode64(parts[1]));
  const header = JSON.parse(headerText), payload = JSON.parse(payloadText);
  if (!exactKeys(header, ['alg','typ']) || header.alg !== 'ES256' || header.typ !== expectedTyp || canonical(header) !== headerText || canonical(payload) !== payloadText) fail('executor_signature_invalid');
  return payload;
}
function publicResult(stored) {
  const result = {
    decision:'PROCEED', status:stored.status, transaction_id:stored.transaction_id,
    result:clone(stored.result), execution_receipt:clone(stored.execution_receipt),
    pre_action:clone(stored.pre_action)
  };
  if (stored.post_witness) result.post_witness = clone(stored.post_witness);
  return result;
}

export function createExecutor({store,signer,authorityKeys,verifyWitness,witnessKeys,clock,policy} = {}) {
  if (typeof store?.transaction !== 'function' || typeof signer?.sign !== 'function' || !uri(signer.keyUri) || !(authorityKeys instanceof Map) || !authorityKeys.size || typeof verifyWitness !== 'function' || !Array.isArray(witnessKeys?.keys) || typeof clock !== 'function') fail('executor_configuration_incomplete');
  requireKeys(policy, ['resource','acceptIssuerAssertedClock','maxClockRadiusMs','maxWitnessAgeMs'], 'executor_policy');
  if (policy.resource !== RESOURCE || typeof policy.acceptIssuerAssertedClock !== 'boolean' || !Number.isSafeInteger(policy.maxClockRadiusMs) || policy.maxClockRadiusMs < 0 || policy.maxClockRadiusMs > 60000 || !Number.isSafeInteger(policy.maxWitnessAgeMs) || policy.maxWitnessAgeMs <= 0) fail('executor_policy_invalid');
  const settings = clone(policy), trustedWitnessKeys = clone(witnessKeys);
  // A rejected transaction is a definite no-effect result only when the store
  // explicitly guarantees rollback on rejection. A lost commit acknowledgment
  // otherwise leaves the outcome unknown, and must never be called STOP.
  async function transaction(callback) {
    const rollbackOnReject = store.rollbackOnReject === true;
    try { return await store.transaction(callback); }
    catch (error) {
      if (!rollbackOnReject && error?.rollbackConfirmed !== true) throw new TransactionOutcomeUnknown('storage_transaction_outcome_unknown');
      throw error;
    }
  }
  const executorPublicKey = clone(publicKey(signer.publicJwk));
  if (trustedWitnessKeys.keys.some(key => key && Object.hasOwn(key, 'd'))) fail('witness_keys_must_be_public');
  const trustedAuthorities = new Map();
  for (const [keyUri, jwk] of authorityKeys) {
    if (!uri(keyUri)) fail('authority_key_uri_invalid');
    trustedAuthorities.set(keyUri, clone(publicKey(jwk)));
  }

  async function freshClock(grant) {
    // A policy requiring measured accuracy is indeterminate: the gate is closed.
    if (!settings.acceptIssuerAssertedClock || grant.clock.requires_measured_accuracy || grant.clock.accept_issuer_asserted !== true) fail('clock_indeterminate_measured_accuracy_required');
    const current = clone(await clock());
    requireKeys(current, ['lower','upper','observed_at_ms','source','accuracy'], 'grounded_time');
    if (![current.lower,current.upper,current.observed_at_ms].every(Number.isSafeInteger) || current.lower > current.observed_at_ms || current.observed_at_ms > current.upper || current.source !== 'platform_wall_clock' || current.accuracy !== 'issuer_asserted') fail('grounded_time_invalid');
    const permittedRadius = Math.min(settings.maxClockRadiusMs, grant.clock.max_radius_ms);
    if (current.observed_at_ms - current.lower > permittedRadius || current.upper - current.observed_at_ms > permittedRadius) fail('clock_radius_exceeds_policy');
    if (current.lower < instant(grant.not_before, 'authorization_not_before') || current.upper >= instant(grant.expires_at, 'authorization_expiry')) fail('authorization_window_closed');
    return current;
  }
  async function signedDecision(decision, reason, request, extra = {}) {
    const payload = {type:'checkpoint-decision/v1',decision,reason};
    if (typeof request?.authorization_id === 'string' && isId(request.authorization_id)) payload.authorization_id = request.authorization_id;
    if (typeof request?.action_id === 'string' && isId(request.action_id)) payload.action_id = request.action_id;
    let receipt = null;
    try {
      const signature = clone(await signer.sign(payload));
      if (!equal(signedPayload(signature, signer.keyUri, 'checkpoint-decision+jws'), payload)) fail('decision_signature_payload_invalid');
      if (!equal(await verifySigned(signature, executorPublicKey, 'checkpoint-decision+jws'), payload)) fail('decision_signature_payload_invalid');
      receipt = {record:payload,signature};
    } catch { /* A broken decision signer cannot change the resource outcome. */ }
    return {decision,reason,decision_receipt:receipt,...extra};
  }
  async function failedOperation(error, fallback, request, extra = {}) {
    if (error instanceof TransactionOutcomeUnknown) {
      return signedDecision('UNKNOWN',fallback.replace(/_failed$/, '_outcome_unknown'),request,{status:'outcome_unknown',retry_execution:false});
    }
    return signedDecision('STOP',error?.code || error?.message || fallback,request,extra);
  }
  async function checkWitness(response, expectedDigest, expectedNonce, previous) {
    const receipt = response?.witness_receipt;
    if (receipt?.protocol_id !== WITNESS_PROTOCOL || !isDigest(receipt.commitment?.payload_digest) || receipt.commitment.nonce !== expectedNonce) fail('witness_binding_invalid');
    if (previous === undefined && receipt.commitment.previous_attestation_digest !== null) fail('pre_action_predecessor_must_be_null');
    const options = {
      expected_node_id:'767-2676.com', expected_nonce:expectedNonce,
      expected_payload_digest:expectedDigest.value,
      max_clock_accuracy_radius_ms:settings.maxClockRadiusMs
    };
    if (previous) options.previous_receipt = previous;
    const verified = await verifyWitness(response, trustedWitnessKeys, options);
    if (verified?.valid !== true) fail(verified?.error_code || 'witness_verification_failed');
    return {receipt,options};
  }
  function checkPreWindow(preReceipt, grant, current) {
    const lower = instant(preReceipt.witness_window_utc?.earliest, 'witness_window_lower');
    const upper = instant(preReceipt.witness_window_utc?.latest, 'witness_window_upper');
    if (lower > upper || lower < instant(grant.not_before, 'authorization_not_before') || upper >= instant(grant.expires_at, 'authorization_expiry')) fail('pre_witness_outside_authorization_window');
    if (!Number.isSafeInteger(preReceipt.clock_accuracy_radius_ms) || preReceipt.clock_accuracy_radius_ms < 0 || preReceipt.clock_accuracy_radius_ms > grant.clock.max_radius_ms) fail('witness_clock_radius_exceeds_authorization');
    if (lower > current.upper || current.upper - lower > settings.maxWitnessAgeMs) fail('pre_witness_stale_or_future');
  }
  async function readAuthorization(authorization) {
    requireKeys(authorization, envelopeKeys, 'authorization');
    const authorityKey = trustedAuthorities.get(authorization.key_uri);
    if (!authorityKey) fail('authorization_authority_untrusted');
    const grant = await verifySigned(authorization, authorityKey, 'checkpoint-authorization+jws');
    requireKeys(grant, GRANT_KEYS, 'authorization');
    if (grant.type !== 'checkpoint-authorization/v1' || !isId(grant.authorization_id) || !isId(grant.action_id) || grant.action_kind !== 'record_checkpoint' || grant.resource !== settings.resource || !isDigest(grant.input_digest)) fail('authorization_scope_invalid');
    const starts = instant(grant.not_before, 'authorization_not_before'), ends = instant(grant.expires_at, 'authorization_expiry');
    if (starts >= ends) fail('authorization_window_invalid');
    requireKeys(grant.clock, ['accept_issuer_asserted','requires_measured_accuracy','max_radius_ms'], 'authorization_clock');
    if (typeof grant.clock.accept_issuer_asserted !== 'boolean' || typeof grant.clock.requires_measured_accuracy !== 'boolean' || !Number.isSafeInteger(grant.clock.max_radius_ms) || grant.clock.max_radius_ms < 0 || grant.clock.max_radius_ms > settings.maxClockRadiusMs) fail('authorization_clock_invalid');
    requireKeys(grant.presenter, ['key_uri','public_jwk'], 'authorized_presenter');
    if (!uri(grant.presenter.key_uri)) fail('presenter_key_uri_invalid');
    publicKey(grant.presenter.public_jwk);
    requireKeys(grant.cost, ['amount_atomic','asset','network','payee'], 'authorization_cost');
    if (grant.cost.amount_atomic !== '2000' || grant.cost.asset !== '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' || grant.cost.network !== 'eip155:8453' || grant.cost.payee !== '0x5f5a631e975183d084f60d7121e967b30ec83cb8') fail('authorization_cost_invalid');
    return {grant,authDigest:await authorizationDigest(authorization)};
  }
  async function requireActiveAuthorization(tx, grant, authDigest, authorityUri) {
    const registered = await tx.get(grantKey(grant.authorization_id));
    if (!registered) fail('authorization_not_registered');
    if (registered.status === 'revoked') fail('authorization_revoked');
    if (registered.status !== 'active' || registered.authorization_id !== grant.authorization_id || registered.authority_key_uri !== authorityUri || !equal(registered.authorization_digest, authDigest)) fail('registered_authorization_mismatch');
  }
  async function registerAuthorization(input) {
    let grant;
    try {
      const initial = canonical(input), authorization = JSON.parse(initial);
      const inspected = await readAuthorization(authorization);
      grant = inspected.grant;
      const authDigest = inspected.authDigest;
      return await transaction(async tx => {
        if (await tx.get(recordKey(grant.authorization_id))) fail('authorization_replay_rejected');
        const existing = await tx.get(grantKey(grant.authorization_id));
        if (existing) {
          if (existing.authority_key_uri !== authorization.key_uri || !equal(existing.authorization_digest, authDigest)) fail('authorization_registration_conflict');
          if (existing.status === 'revoked') fail('authorization_revoked');
          if (existing.status !== 'active') fail('registered_authorization_state_invalid');
        }
        if (canonical(input) !== initial) fail('changed_authorization_during_registration');
        if (!existing) await tx.put(grantKey(grant.authorization_id), {authorization_id:grant.authorization_id,authorization_digest:authDigest,authority_key_uri:authorization.key_uri,status:'active',authorization});
        return {status:'active',authorization_id:grant.authorization_id,authorization_digest:authDigest};
      });
    } catch (error) {
      return failedOperation(error,'authorization_registration_failed',grant);
    }
  }
  async function revokeAuthorization(input) {
    let revocation;
    try {
      const initial = canonical(input), envelope = JSON.parse(initial);
      requireKeys(envelope, envelopeKeys, 'revocation');
      const authorityKey = trustedAuthorities.get(envelope.key_uri);
      if (!authorityKey) fail('revocation_authority_untrusted');
      revocation = await verifySigned(envelope, authorityKey, 'checkpoint-revocation+jws');
      requireKeys(revocation, ['type','authorization_id','authorization_digest'], 'revocation');
      if (revocation.type !== 'checkpoint-revocation/v1' || !isId(revocation.authorization_id) || !isDigest(revocation.authorization_digest)) fail('revocation_invalid');
      return await transaction(async tx => {
        const key = grantKey(revocation.authorization_id), existing = await tx.get(key);
        if (existing && (existing.authority_key_uri !== envelope.key_uri || !equal(existing.authorization_digest, revocation.authorization_digest))) fail('revocation_authority_or_digest_mismatch');
        if (existing && !['active','revoked'].includes(existing.status)) fail('registered_authorization_state_invalid');
        const committed = await tx.get(recordKey(revocation.authorization_id));
        if (canonical(input) !== initial) fail('changed_revocation_during_verification');
        // A verified revocation is a monotonic tombstone even if it arrives
        // before enrollment. No later enrollment can make this ID active again.
        if (existing?.status !== 'revoked') await tx.put(key, {
          ...(existing || {}),authorization_id:revocation.authorization_id,
          authorization_digest:clone(revocation.authorization_digest),authority_key_uri:envelope.key_uri,
          status:'revoked',revocation:envelope
        });
        return {status:'revoked',authorization_id:revocation.authorization_id,authorization_digest:clone(revocation.authorization_digest),already_committed:Boolean(committed)};
      });
    } catch (error) {
      return failedOperation(error,'authorization_revocation_failed',revocation);
    }
  }
  async function inspectRequest(request) {
    requireKeys(request, ['authorization','presenter','action_bytes','pre_action'], 'request');
    const {grant,authDigest} = await readAuthorization(request.authorization);
    requireKeys(request.presenter, envelopeKeys, 'presenter');
    if (request.presenter.key_uri !== grant.presenter.key_uri) fail('presenter_identity_does_not_bind');
    const presented = await verifySigned(request.presenter, grant.presenter.public_jwk, 'checkpoint-presenter+jws');
    requireKeys(presented, PRESENTATION_KEYS, 'presentation');
    if (presented.type !== 'checkpoint-presentation/v1' || presented.authorization_id !== grant.authorization_id || presented.action_id !== grant.action_id || presented.audience !== EXECUTE_URI || !equal(presented.authorization_digest, authDigest) || !equal(presented.input_digest, grant.input_digest)) fail('presenter_identity_or_action_binding_invalid');
    nonce(presented.nonce);
    const prepared = await prepareCommitment(request.action_bytes);
    if (prepared.action.action_id !== grant.action_id || prepared.action.action_kind !== grant.action_kind || !equal(prepared.input_digest, grant.input_digest)) fail('authorized_action_bytes_do_not_match');
    const params = new Map(prepared.parameters.map(parameter => [parameter.id,parameter.value]));
    if (params.get('scope') !== grant.resource || !equal(params.get('clock'), grant.clock) || !equal(params.get('cost'), grant.cost)) fail('authorization_scope_clock_or_cost_mismatch');
    requireKeys(request.pre_action, ['record','witness_response'], 'pre_action');
    requireKeys(request.pre_action.record, PRE_KEYS, 'pre_action_record');
    const expectedPre = {type:'authorization-bound-pre-action/v1',authorization_id:grant.authorization_id,authorization_digest:authDigest,authorization_expires_at:grant.expires_at,action_id:grant.action_id,input_digest:grant.input_digest,nonce:presented.nonce};
    if (!equal(request.pre_action.record, expectedPre)) fail('pre_action_authorization_binding_invalid');
    const preDigest = {algorithm:'sha-256',value:await digest(expectedPre)};
    const pre = await checkWitness(request.pre_action.witness_response, preDigest, presented.nonce);
    const current = await freshClock(grant);
    checkPreWindow(pre.receipt, grant, current);
    return {grant,presented,authDigest,prepared,preDigest,preVerification:pre.options};
  }

  async function execute(input) {
    let inspected;
    try {
      const initial = canonical(input);
      if (utf8(initial).length > 262144) fail('request_too_large');
      const request = JSON.parse(initial);
      inspected = await inspectRequest(request);
      const {grant,presented,authDigest,prepared} = inspected;
      const unchanged = () => { if (canonical(input) !== initial) fail('changed_bytes_between_validation_and_execution'); };
      unchanged();
      return await transaction(async tx => {
        await requireActiveAuthorization(tx, grant, authDigest, request.authorization.key_uri);
        if (await tx.get(recordKey(grant.authorization_id))) fail('authorization_replay_rejected');
        if (await tx.get(nonceKey(presented.nonce))) fail('nonce_replay_rejected');
        // Validation runs inside the resource transaction, after storage reads.
        const rechecked = await prepareCommitment(request.action_bytes);
        if (!equal(rechecked, prepared) || !equal(rechecked.input_digest, grant.input_digest)) fail('changed_action_bytes');
        let current = await freshClock(grant);
        checkPreWindow(request.pre_action.witness_response.witness_receipt, grant, current);
        unchanged();
        const transactionId = 'checkpoint_' + await digest({authorization_id:grant.authorization_id,authorization_digest:authDigest,action_id:grant.action_id,input_digest:grant.input_digest});
        const result = {type:'checkpoint-record/v1',transaction_id:transactionId,action_id:grant.action_id,input_digest:clone(grant.input_digest),checkpoint_digest:clone(prepared.action.checkpoint_digest)};
        const unsignedReceipt = {
          type:'authorization-bound-execution-receipt/v1',authorization_id:grant.authorization_id,
          authorization_expires_at:grant.expires_at,authorization_digest:authDigest,
          action_id:grant.action_id,action_kind:grant.action_kind,input_digest:clone(grant.input_digest),
          committed_result_digest:{algorithm:'sha-256',value:await digest(result)},executor_key_uri:signer.keyUri
        };
        const signature = clone(await signer.sign(unsignedReceipt));
        if (!equal(signedPayload(signature, signer.keyUri, 'authorization-bound-execution-receipt+jws'), unsignedReceipt)) fail('executor_signature_payload_invalid');
        if (!equal(await verifySigned(signature, executorPublicKey, 'authorization-bound-execution-receipt+jws'), unsignedReceipt)) fail('executor_signature_payload_invalid');
        const receipt = {...unsignedReceipt,executor_signature:signature};
        // Signing is asynchronous. The final gate follows signing, not precedes it.
        await requireActiveAuthorization(tx, grant, authDigest, request.authorization.key_uri);
        current = await freshClock(grant);
        checkPreWindow(request.pre_action.witness_response.witness_receipt, grant, current);
        unchanged();
        const stored = {
          status:'committed_post_witness_pending',transaction_id:transactionId,result,
          execution_receipt:receipt,pre_action:clone(request.pre_action),
          authorization:clone(request.authorization),presenter:clone(request.presenter),
          action_bytes:request.action_bytes,commitment:clone(prepared),
          pre_verification:clone(inspected.preVerification),decision_time:current
        };
        await tx.put(recordKey(grant.authorization_id), stored);
        await tx.put(nonceKey(presented.nonce), {authorization_id:grant.authorization_id,transaction_id:transactionId});
        // A slow transactional write must abort, rather than commit expired work.
        await requireActiveAuthorization(tx, grant, authDigest, request.authorization.key_uri);
        current = await freshClock(grant);
        checkPreWindow(request.pre_action.witness_response.witness_receipt, grant, current);
        unchanged();
        return publicResult(stored);
      });
    } catch (error) {
      return failedOperation(error,'action_failed',inspected?.grant);
    }
  }

  async function finalize(input) {
    let retainedStatus = 'not_committed';
    try {
      requireKeys(input, ['authorization_id','post_witness'], 'finalization');
      if (!isId(input.authorization_id)) fail('authorization_id_invalid');
      const snapshot = canonical(input);
      if (utf8(snapshot).length > 262144) fail('request_too_large');
      const request = JSON.parse(snapshot);
      return await transaction(async tx => {
        const stored = await tx.get(recordKey(request.authorization_id));
        if (!stored) fail('checkpoint_not_committed');
        retainedStatus = stored.status;
        if (stored.status === 'complete') {
          if (!equal(stored.post_witness, request.post_witness)) fail('post_witness_already_attached');
          return publicResult(stored);
        }
        if (stored.status !== 'committed_post_witness_pending') fail('checkpoint_state_invalid');
        const preResponse = stored.pre_action.witness_response;
        const preParts = preResponse.witness_attestation.compact_jws.split('.');
        if (preParts.length !== 3) fail('stored_pre_witness_invalid');
        // Hash the exact decoded payload bytes. Never reserialize that JWS payload.
        const predecessor = {algorithm:'sha-256',value:await digestBytes(decode64(preParts[1]))};
        const postReceipt = request.post_witness?.witness_receipt;
        const postNonce = nonce(postReceipt?.commitment?.nonce);
        if (postNonce === stored.pre_action.record.nonce) fail('post_witness_nonce_must_be_fresh');
        if (!equal(postReceipt?.commitment?.previous_attestation_digest, predecessor)) fail('post_witness_predecessor_mismatch');
        const executionDigest = {algorithm:'sha-256',value:await digest(stored.execution_receipt)};
        await checkWitness(request.post_witness, executionDigest, postNonce, {response:preResponse,jwks:trustedWitnessKeys,verification:stored.pre_verification});
        if (await tx.get(nonceKey(postNonce))) fail('post_witness_nonce_replay_rejected');
        if (canonical(input) !== snapshot) fail('changed_post_witness_during_verification');
        const completed = {...stored,status:'complete',post_witness:clone(request.post_witness)};
        await tx.put(recordKey(request.authorization_id), completed);
        await tx.put(nonceKey(postNonce), {authorization_id:request.authorization_id,transaction_id:stored.transaction_id,phase:'post_commit'});
        return publicResult(completed);
      });
    } catch (error) {
      // The committed resource effect is never rolled back or executed again.
      return failedOperation(error,'post_witness_finalization_failed',input,{status:retainedStatus});
    }
  }
  // Internal adapter hook only. A public transport must not expose arbitrary
  // authorization-ID lookups; authenticated recovery is a separate capability.
  async function inspect(authorizationId) {
    if (!isId(authorizationId)) fail('authorization_id_invalid');
    return store.transaction(async tx => {
      const stored = await tx.get(recordKey(authorizationId));
      return stored === undefined ? null : clone(stored);
    });
  }
  return {registerAuthorization,revokeAuthorization,execute,finalize,inspect};
}
