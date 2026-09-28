import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import worker from '../index.js';
import {documentation,renderDocumentation,routes,updateWorker,splitAssets} from '../../../site/agent-docs/update-worker.mjs';

test('agent documentation serves the approved text over GET and HEAD without network access',async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('Documentation attempted a network request');};
  try{
    for(const route of routes){
      const response=await worker.fetch(new Request('https://767-2676.com'+route),{},{});
      assert.equal(response.status,200,route);
      const text=await response.text();
      assert.equal(text.split('How agents use the witness layer').length,2,route+' duplicate section');
      assert.ok(text.includes(route.endsWith('.md')||route.endsWith('.txt')?documentation:renderDocumentation()),route+' approved section');
      if(!route.endsWith('.md')&&!route.endsWith('.txt')){
        assert.ok(text.includes('href="https://popcorn-tain-verify-mcp-v2.violetherod.workers.dev/mcp"'),'Verifier link must exclude sentence punctuation');
      }
      const head=await worker.fetch(new Request('https://767-2676.com'+route,{method:'HEAD'}),{},{});
      assert.equal(head.status,200,route+' HEAD');
      assert.equal(await head.text(),'');
    }
  }finally{globalThis.fetch=previousFetch;}
});

test('documentation updater is idempotent and preserves unrelated assets and Worker source',()=>{
  const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
  const before=splitAssets(source),afterSource=updateWorker(source),after=splitAssets(afterSource);
  assert.equal(afterSource,source,'Generated documentation is stale');
  assert.equal(afterSource.slice(0,after.start),source.slice(0,before.start));
  assert.equal(afterSource.slice(after.end),source.slice(before.end));
  assert.deepEqual(Object.keys(after.assets),Object.keys(before.assets));
  for(const route of Object.keys(before.assets))if(!routes.includes(route))assert.deepEqual(after.assets[route],before.assets[route],route);
  assert.equal(after.assets['/'].body,before.assets['/'].body,'Homepage');
  assert.equal(afterSource.split('\n')[0],source.split('\n')[0],'Signed checkpoint');
});
