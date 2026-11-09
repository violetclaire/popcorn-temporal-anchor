import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {generateKeyPairSync} from 'node:crypto';
const {default:worker,BriarwoodAgentEngine}=await import(process.env.POPCORN_TEST_WORKER?pathToFileURL(process.env.POPCORN_TEST_WORKER).href:'../index.js');
const origin='https://767-2676.com',route=origin+'/agent/handoff';
const ephemeralJwk=JSON.stringify(generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'}));
function setup() {
  const records=new Map(),calls=[];
  const env={X402_PAY_TO:'0x5f5a631e975183d084f60d7121e967b30ec83cb8',POPCORN_SIGNING_KEY_JWK:ephemeralJwk,X402_FACILITATOR:{async fetch(req){
    const op=new URL(req.url).pathname.slice(1);calls.push(op);await req.json();
    return Response.json(op==='verify'?{isValid:true}:{success:true,transaction:'0x'+'4'.repeat(64),network:'eip155:8453'});
  }}};
  const engine=new BriarwoodAgentEngine({blockConcurrencyWhile:fn=>fn(),storage:{get:async k=>records.get(k),put:async(k,v)=>{if(typeof k==='object')for(const [a,b]of Object.entries(k))records.set(a,b);else records.set(k,v);}}},env);
  env.Agent_Engine={idFromName:n=>n,get:()=>({fetch:r=>engine.fetch(r)})};
  return{env,calls,records};
}
function req(body,headers={}){return new Request(route,{method:'POST',body,headers});}
test('unpaid discovery does not contact the stateful handoff engine',async()=>{
  const s=setup();s.env.Agent_Engine={idFromName(){throw Error('unpaid discovery reached the engine');}};
  const r=await worker.fetch(req('{}',{'content-type':'application/json'}),s.env,{});
  assert.equal(r.status,402);assert.equal((await r.json()).accepts[0].amount,'1000');assert.deepEqual(s.calls,[]);
});
for(const [label,body,type]of [['empty',undefined,undefined],['object','{}','application/json'],['broken JSON','{','application/json'],['wrong content type','text','text/plain']])test('unpaid handoff '+label+' returns the price before reading input',async()=>{
  const s=setup(),r=req(body,type?{'content-type':type}:{});
  Object.defineProperty(r,'text',{value:()=>{throw Error('unpaid body read');}});
  const response=await worker.fetch(r,s.env,{}),value=await response.json();
  assert.equal(response.status,402);assert.equal(value.resource.url,route);
  assert.equal(value.accepts[0].amount,'1000');assert.equal(value.accepts[0].network,'eip155:8453');
  assert.equal(value.accepts[0].asset.toLowerCase(),'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  assert.equal(value.accepts[0].payTo.toLowerCase(),s.env.X402_PAY_TO);assert.deepEqual(s.calls,[]);
});
test('payment-bearing malformed handoff is rejected without settlement',async()=>{
  const s=setup();const r=await worker.fetch(req('{}',{'content-type':'application/json','payment-signature':'synthetic-unused'}),s.env,{});
  assert.equal(r.status,422);assert.equal((await r.json()).error_code,'node_id_invalid');assert.deepEqual(s.calls,[]);
});
test('well-formed mock-settled handoff keeps its 202 contract and stores only digest',async()=>{
  const s=setup(),challenge=await(await worker.fetch(req(),s.env,{})).json();
  const proof=Buffer.from(JSON.stringify({x402Version:2,accepted:challenge.accepts[0],resource:{url:route},payload:{signature:'local-test-only',authorization:{nonce:'0x'+'3'.repeat(64)}}})).toString('base64');
  const body={node_id:'nov8-local-test',task_payload:{purpose:'local synthetic acceptance'},execution_window_utc:{opens_at_utc:new Date(Date.now()-60000).toISOString(),closes_at_utc:new Date(Date.now()+60000).toISOString()}};
  const r=await worker.fetch(req(JSON.stringify(body),{'content-type':'application/json','payment-signature':proof}),s.env,{}),value=await r.json();
  assert.equal(r.status,202);assert.equal(value.payment_state,'settled');assert.equal(value.handoff_state,'validated');assert.equal(value.completion_state,'not_observed');assert.equal(value.task_payload_retained,false);assert.deepEqual(s.calls,['verify','settle']);
  const stored=s.records.get('handoff:'+value.handoff_id);assert.equal(stored.task_payload_retained,false);assert.equal(stored.task_payload,undefined);assert.match(stored.task_payload_sha256,/^[A-Za-z0-9_-]{43}$/);
});
