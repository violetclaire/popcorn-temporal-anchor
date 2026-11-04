import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker, {createHandler} from './worker.mjs';
import {createDemo,humanCard,agentCard} from './demo.mjs';
import {HttpError} from './card.mjs';
const req = (path,init) => new Request('https://briarwood.ai' + path,init);
const submit = card => req('/catalog/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({card_url:card.card_url})});

test('one address lists a human provider; search returns all terms and contact; repeat does not duplicate',async()=>{
  const demo=await createDemo({seed:false});const handler=createHandler({...demo,writable:true});
  const response=await handler(submit(humanCard));assert.equal(response.status,201);
  const ack=await response.json();assert.equal(ack.listed,true);assert.equal(ack.fee,0);assert.equal(ack.state,'listed');assert.match(ack.meaning,/Not a POPCORN/);
  const search=await (await handler(req('/catalog/search?q=wedding%20makeup'))).json();
  assert.equal(search.results[0].source_sha256,ack.card_sha256);assert.equal(search.results[0].provider_declaration.terms.cost,humanCard.terms.cost);
  assert.equal(search.results[0].provider_declaration.contact.url,humanCard.contact.url);assert.equal(search.results[0].execution_authorized,false);
  const again=await (await handler(submit(humanCard))).json();assert.equal(again.state,'unchanged');assert.equal(again.evidence.commit,ack.evidence.commit);
  assert.equal((await demo.repository.read()).ledger.entries.length,1);
});
test('agent endpoint comes back as declaration without being invoked',async()=>{
  const demo=await createDemo();const calls=[];const handler=createHandler({...demo,loadCard:async url=>{calls.push(url);return demo.loadCard(url);}});
  const search=await (await handler(req('/catalog/search?q=planning'))).json();assert.equal(search.results[0].provider_declaration.service.endpoint,agentCard.service.endpoint);
  assert.deepEqual(calls,[agentCard.card_url]);assert.equal(search.results[0].availability_confirmed,false);
});
test('catalog is complete in first HTML, escaped, green, and noninteractive',async()=>{
  const demo=await createDemo();const snap=await demo.repository.read();snap.ledger.entries[0].name='<script>alert(1)</script>';
  const handler=createHandler({repository:{read:async()=>snap},demo:true});const response=await handler(req('/catalog'));const html=await response.text();
  assert.match(html,/background:#173d34/);assert.match(html,/You wake up on a borrowed computer/);assert.match(html,/WORKING PREVIEW/);
  assert.match(html,/&lt;script&gt;alert/);assert.ok(html.includes(humanCard.card_url));assert.ok(html.includes(agentCard.card_url));
  assert.doesNotMatch(html,/<(?:a|script|button|input|select|textarea|form|iframe|img|svg|link|details)\b/i);
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
});
test('failed catalog read is an explicit 503, never an empty successful search',async()=>{
  const handler=createHandler({repository:{read:async()=>{throw new Error('secret token should not escape');}}});
  const response=await handler(req('/catalog/search?q=wedding'));assert.equal(response.status,503);const body=await response.text();assert.doesNotMatch(body,/secret token/);assert.doesNotMatch(body,/"results": \[\]/);
});
test('invalid card and unconfirmed repository publication never report listed',async()=>{
  let writes=0;const handler=createHandler({writable:true,repository:{publish:async()=>{writes++;}},loadCard:async()=>{throw new HttpError(400,'CARD_FIELD_INVALID','terms.cost: required');}});
  const response=await handler(submit(humanCard));assert.equal(response.status,400);assert.match(await response.text(),/terms.cost/);assert.equal(writes,0);
  const demo=await createDemo();const failed=createHandler({...demo,writable:true,repository:{publish:async()=>{throw new HttpError(503,'publication_unconfirmed','Public commit not confirmed.');}}});
  const fail=await failed(submit(humanCard));assert.equal(fail.status,503);assert.doesNotMatch(await fail.text(),/"listed": true/);
});
test('unavailable, changed, and withdrawn sources have distinct states and no ready handoff',async()=>{
  for(const state of ['source_unavailable','card_changed','withdrawn_at_source']){
    const demo=await createDemo();
    const loadCard=async url=>{if(state==='source_unavailable')throw Error('offline');const result=await demo.loadCard(url);if(state==='card_changed')result.sha256='f'.repeat(64);if(state==='withdrawn_at_source')result.card.listed=false;return result;};
    const body=await (await createHandler({...demo,loadCard})(req('/catalog/search?q=makeup'))).json();assert.equal(body.results[0].state,state);assert.equal(body.handoffs_complete,false);assert.equal(body.matching_count,1);assert.equal(body.results[0].provider_declaration,undefined);
  }
});
test('listing order is preserved and simple lexical search is declared honestly',async()=>{
  const demo=await createDemo();const data=await (await createHandler(demo)(req('/catalog/search?q=wedding'))).json();
  assert.deepEqual(data.results.map(x=>x.entry.name),[humanCard.name,agentCard.name]);assert.deepEqual(data.search_fields,['name','offer']);assert.equal(data.order,'listing');
});
test('writes disabled is explicit; templates and all GET routes support HEAD',async()=>{
  const handler=createHandler(await createDemo());assert.equal((await handler(submit(humanCard))).status,503);
  for(const path of ['/catalog','/catalog.json','/catalog/card-template.json','/catalog/search?q=makeup','/catalog/status?card_url='+encodeURIComponent(humanCard.card_url)]){const response=await handler(req(path,{method:'HEAD'}));assert.equal(response.status,200);assert.equal(await response.text(),'');}
});
test('body accepts only one public card URL, not credentials or arbitrary destination overrides',async()=>{
  const demo=await createDemo();const handler=createHandler({...demo,writable:true});
  for(const body of [{card_url:humanCard.card_url,token:'private'},{card_url:'http://127.0.0.1/card'},{card_url:humanCard.card_url,repo:'elsewhere'}]){const response=await handler(req('/catalog/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));assert.equal(response.status,400);}
  const big=await handler(req('/catalog/submissions',{method:'POST',headers:{'content-type':'application/json'},body:' '.repeat(4097)}));assert.equal(big.status,413);
});
test('withdrawal updates the pointer and removes it from search without calling the contact',async()=>{
  const demo=await createDemo();demo.cards.get(humanCard.card_url).listed=false;const handler=createHandler({...demo,writable:true});
  const ack=await (await handler(submit(humanCard))).json();assert.equal(ack.state,'withdrawn');assert.equal(ack.listed,false);
  assert.equal((await (await handler(req('/catalog/search?q=makeup'))).json()).matching_count,0);
  const status=await (await handler(req('/catalog/status?card_url='+encodeURIComponent(humanCard.card_url)))).json();assert.equal(status.state,'withdrawn');
});
test('empty search reports no_matches without claiming a completed handoff',async()=>{
  const response=await createHandler(await createDemo())(req('/catalog/search?q=submarine'));
  const body=await response.json();assert.equal(body.state,'no_matches');assert.equal(body.matching_count,0);assert.equal(body.handoffs_complete,false);assert.equal(body.results_complete,true);
});
test('production entry point refuses intake before both narrow writer and rate limiter are configured',async()=>{
  const env={CATALOG_OWNER:'violetclaire',CATALOG_REPO:'briarwood-pointers',CATALOG_BRANCH:'main',CATALOG_PATH:'pointers.json',PUBLIC_INTAKE_ENABLED:'true'};
  for(const partial of [{},{CATALOG_GITHUB_TOKEN:'not-a-live-secret'},{INTAKE_RATE_LIMITER:{limit:async()=>({success:true})}}]){
    const response=await worker.fetch(submit(humanCard),{...env,...partial});assert.equal(response.status,503);assert.equal((await response.json()).error,'intake_not_configured');
  }
});
