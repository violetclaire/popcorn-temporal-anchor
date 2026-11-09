import {createExecutor} from './executor.mjs';
import {canonical,createSigner,publicKey,verifySigned,isId,exactKeys,decode64,authorizationDigest,fail} from './model.js';

const ORIGIN = 'https://767-2676.com';
const INSTANCE = 'checkpoint-executor-v1';
const LIMIT = 262144;
const ROUTES = new Map([
  ['/checkpoint/authorize','registerAuthorization'],
  ['/checkpoint/revoke','revokeAuthorization'],
  ['/checkpoint/execute','execute'],
  ['/checkpoint/finalize','finalize'],
  ['/checkpoint/recover','recover'],
  ['/checkpoint/clock','clock']
]);
const json = (value,status=200,extra={}) => new Response(JSON.stringify(value), {status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'",...extra
}});
async function boundedJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail('content_type_must_be_json');
  if (Number(request.headers.get('content-length')) > LIMIT) fail('request_too_large');
  if (!request.body) fail('incomplete, need request body');
  const reader = request.body.getReader(), chunks = []; let total=0;
  try {
    while (true) { const {done,value} = await reader.read(); if(done)break; total+=value.length; if(total>LIMIT)fail('request_too_large');chunks.push(value); }
  } catch(error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function config(env) {
  // Installed configuration only. Request bodies cannot choose keys or policies.
  const required = ['CHECKPOINT_POLICY_JSON','CHECKPOINT_AUTHORITY_KEYS_JSON','CHECKPOINT_EXECUTOR_KEY_URI','CHECKPOINT_EXECUTOR_SIGNING_JWK'];
  for (const name of required) if (typeof env?.[name] !== 'string' || !env[name]) fail('incomplete, need '+name);
  const policy = JSON.parse(env.CHECKPOINT_POLICY_JSON);
  const configured = JSON.parse(env.CHECKPOINT_AUTHORITY_KEYS_JSON);
  if (!Array.isArray(configured) || !configured.length) fail('authority_configuration_invalid');
  const authorities = new Map();
  for (const item of configured) {
    if (!exactKeys(item,['key_uri','public_jwk']) || authorities.has(item.key_uri)) fail('authority_configuration_invalid');
    authorities.set(item.key_uri,publicKey(item.public_jwk));
  }
  const privateJwk = JSON.parse(env.CHECKPOINT_EXECUTOR_SIGNING_JWK);
  const {kty,crv,x,y} = privateJwk;
  const publicJwk = publicKey({kty,crv,x,y});
  const keyUri = env.CHECKPOINT_EXECUTOR_KEY_URI;
  if (keyUri !== ORIGIN+'/.well-known/checkpoint-executor-key.json') fail('executor_key_uri_invalid');
  return {policy,authorities,privateJwk,publicJwk,keyUri};
}
async function configuredExecutor(state,env,helpers) {
  const settings=config(env), radius=helpers.getWitnessRadius(env);
  if (!Number.isSafeInteger(radius) || radius<0 || radius>10000) fail('clock_configuration_invalid');
  const executionSigner=await createSigner({...settings,typ:'authorization-bound-execution-receipt+jws'});
  const decisionSigner=await createSigner({...settings,typ:'checkpoint-decision+jws'});
  const signer={keyUri:settings.keyUri,publicJwk:settings.publicJwk,sign:payload =>
    payload.type==='authorization-bound-execution-receipt/v1' ? executionSigner.sign(payload) : decisionSigner.sign(payload)};
  const store={
    rollbackOnReject:state.storage.rollbackOnReject===true,
    transaction:operation=>state.storage.transaction(async tx=>{
      try{return await operation(tx);}
      catch(error){
        // Confirm an explicit abort. A rejection after this closure returns may
        // be a lost commit acknowledgment and must retain UNKNOWN semantics.
        if(typeof tx.rollback==='function'){tx.rollback();error.rollbackConfirmed=true;}
        throw error;
      }
    })
  };
  const service=createExecutor({
    store,signer,authorityKeys:settings.authorities,
    verifyWitness:helpers.verifyWitness,witnessKeys:helpers.getWitnessKeys(env),policy:settings.policy,
    clock:async()=>{const now=Date.now();return {lower:now-radius,upper:now+radius,observed_at_ms:now,source:'platform_wall_clock',accuracy:'issuer_asserted'};}
  });
  return {service,settings};
}
async function recovery(service,input) {
  if (!exactKeys(input,['authorization_id','presenter']) || !isId(input.authorization_id)) fail('recovery_request_invalid');
  const stored=await service.inspect(input.authorization_id);
  if(!stored) fail('checkpoint_not_committed');
  const grant=JSON.parse(new TextDecoder().decode(decode64(stored.authorization.compact_jws.split('.')[1])));
  if(input.presenter?.key_uri!==grant.presenter.key_uri)fail('presenter_identity_does_not_bind');
  const proof=await verifySigned(input.presenter,grant.presenter.public_jwk,'checkpoint-recovery+jws');
  if(!exactKeys(proof,['type','authorization_id','nonce','audience']) || proof.type!=='checkpoint-recovery/v1' || proof.authorization_id!==input.authorization_id || proof.audience!==ORIGIN+'/checkpoint/recover' || decode64(proof.nonce).length!==32)fail('recovery_proof_invalid');
  return {status:stored.status,decision:'PROCEED',transaction_id:stored.transaction_id,result:stored.result,execution_receipt:stored.execution_receipt,pre_action:stored.pre_action,...stored.post_witness?{post_witness:stored.post_witness}:{}};
}
async function groundedClock(input,state,env,helpers) {
  if(!exactKeys(input,['authorization','presenter']))fail('clock_request_invalid');
  const settings=config(env),authority=settings.authorities.get(input.authorization?.key_uri);
  if(!authority)fail('authorization_authority_untrusted');
  const grant=await verifySigned(input.authorization,authority,'checkpoint-authorization+jws');
  if(grant.type!=='checkpoint-authorization/v1' || grant.resource!=='popcorn-checkpoint-demo' || !isId(grant.authorization_id) || input.presenter?.key_uri!==grant.presenter?.key_uri)fail('clock_request_invalid');
  const authDigest=await authorizationDigest(input.authorization);
  const proof=await verifySigned(input.presenter,grant.presenter.public_jwk,'checkpoint-clock-request+jws');
  if(!exactKeys(proof,['type','authorization_id','authorization_digest','nonce','audience']) || proof.type!=='checkpoint-clock-request/v1' || proof.authorization_id!==grant.authorization_id || canonical(proof.authorization_digest)!==canonical(authDigest) || proof.audience!==ORIGIN+'/checkpoint/clock' || decode64(proof.nonce).length!==32)fail('clock_request_invalid');
  const registered=await state.storage.get('checkpoint:grant:'+grant.authorization_id);
  if(registered?.status==='revoked')fail('authorization_revoked');
  const radius=helpers.getWitnessRadius(env);
  if(!Number.isSafeInteger(radius) || radius<0 || radius>10000)fail('clock_configuration_invalid');
  // This is the resource's nonce-bound time assertion for an authorized demo.
  // It is not a POPCORN temporal receipt, measured accuracy, or permission.
  const now=Date.now();
  const starts=Date.parse(grant.not_before),ends=Date.parse(grant.expires_at);
  if(!Number.isSafeInteger(starts) || !Number.isSafeInteger(ends) || now-radius<starts || now+radius>=ends)fail('authorization_window_closed');
  const record={type:'checkpoint-time/v1',authorization_id:grant.authorization_id,authorization_digest:authDigest,nonce:proof.nonce,lower:now-radius,upper:now+radius,observed_at_ms:now,source:'platform_wall_clock',accuracy:'issuer_asserted'};
  const signer=await createSigner({...settings,typ:'checkpoint-time+jws'});
  return {record,signature:await signer.sign(record)};
}
export async function handleCheckpointRequest(request,env,helpers) {
  const url=new URL(request.url);
  if(url.pathname==='/.well-known/checkpoint-executor-key.json') {
    if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405,{allow:'GET, HEAD'});
    try {const c=config(env);return new Response(request.method==='HEAD'?null:JSON.stringify({key_uri:c.keyUri,public_jwk:c.publicJwk}),{headers:{'content-type':'application/json','cache-control':'no-store'}});}
    catch{return json({error:'checkpoint_not_configured'},503);}
  }
  if(!url.pathname.startsWith('/checkpoint/')) return null;
  const method=ROUTES.get(url.pathname);
  if(!method)return json({error:'checkpoint_route_not_found'},404);
  if(url.origin!==ORIGIN || url.search)return json({error:'checkpoint_resource_mismatch'},400);
  if(request.method!=='POST')return json({error:'method_not_allowed'},405,{allow:'POST'});
  // No cookie session or ambient credentials: every command carries a verified
  // authority/presenter signature. Do not enable browser cross-origin writes.
  const origin=request.headers.get('origin');if(origin && origin!==ORIGIN)return json({error:'origin_not_allowed'},403);
  let input;try{input=await boundedJson(request);}catch{return json({decision:'STOP',error:'invalid_or_oversized_json'},400);}
  const binding=env?.Agent_Engine??env?.AGENT_ENGINE;
  if(!binding)return json({error:'checkpoint_storage_unavailable'},503);
  try {
    // One fixed partition for all authorizations: caller IDs cannot select a new
    // object to bypass the resource's consumed-ID and revocation records.
    return await binding.get(binding.idFromName(INSTANCE)).fetch(new Request(ORIGIN+'/__checkpoint/'+method,{method:'POST',headers:{'content-type':'application/json'},body:canonical(input)}));
  } catch {return json({error:'checkpoint_outcome_unknown',retry_execution:false},503);}
}
export async function handleCheckpointDurable(request,state,env,helpers) {
  const url=new URL(request.url),method=url.pathname.slice('/__checkpoint/'.length);
  if(!url.pathname.startsWith('/__checkpoint/') || ![...ROUTES.values()].includes(method))return json({error:'not_found'},404);
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  let input;try{input=await boundedJson(request);}catch{return json({error:'invalid_or_oversized_json'},400);}
  if(method==='clock') {
    try{return json(await groundedClock(input,state,env,helpers));}
    catch{return json({decision:'STOP',error:'clock_unavailable_or_unauthorized'},403);}
  }
  let service;
  try{({service}=await configuredExecutor(state,env,helpers));}catch{return json({decision:'STOP',error:'checkpoint_not_configured'},503);}
  try {
    const result=method==='recover'?await recovery(service,input):await service[method](input);
    return json(result,result.decision==='UNKNOWN'?503:result.decision==='STOP'?409:200);
  } catch {return json({error:'checkpoint_outcome_unknown',retry_execution:false},503);}
}
export {INSTANCE as CHECKPOINT_OBJECT_NAME};
