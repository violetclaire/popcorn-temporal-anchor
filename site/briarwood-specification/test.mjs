import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build,sha256} from './build.mjs';
import {createHandler} from './handler.mjs';
const {assets,manifest} = build();
const handle = createHandler(assets);
const origins = ['https://briarwood.ai/specification/v1','https://767-2676.com/briarwood/specification/v1'];
const decode = text => text.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
test('both origins serve every versioned artifact exactly, including query strings', async()=>{
  for(const base of origins) for(const [suffix,asset] of Object.entries(assets)) {
    const response = await handle(new Request(base + suffix + '?verification=1'));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),asset.content_type);
    assert.equal(response.headers.get('content-length'),String(asset.bytes));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length,asset.bytes); assert.equal(sha256(bytes),asset.sha256);
  }
});
test('raw source blobs and decoded visible text equal the locked originals',()=>{
  for(const doc of manifest.documents) {
    const expected = fs.readFileSync(new URL('./documents/'+doc.file,import.meta.url),'utf8');
    const match = assets[''].body.match(new RegExp('<pre data-document="'+doc.id+'">([\\s\\S]*?)</pre>'));
    assert(match); assert.equal(decode(match[1]),expected); assert.equal(sha256(expected),doc.sha256);
  }
  assert.equal((assets[''].body.match(/<pre\b/g)||[]).length,3);
});
test('the page is self-contained and has no active controls or external resources',()=>{
  assert(!/<(?:a|script|img|button|form|input|select|textarea|details|iframe|audio|video|link)\b/i.test(assets[''].body));
  assert(!/\son\w+\s*=/i.test(assets[''].body));
  assert(!/\b(?:src|href)\s*=/i.test(assets[''].body));
  assert.match(assets[''].csp,/default-src 'none'/);
});
test('HEAD and conditional requests retain validators without response bodies',async()=>{
  for(const base of origins) for(const [suffix,asset] of Object.entries(assets)) {
    const head = await handle(new Request(base+suffix,{method:'HEAD'}));
    assert.equal(head.status,200); assert.equal(await head.text(),'');
    assert.equal(head.headers.get('content-length'),String(asset.bytes));
    assert.match(head.headers.get('cache-control'),/immutable, no-transform/);
    const conditional = await handle(new Request(base+suffix,{headers:{'if-none-match':'"'+asset.sha256+'"'}}));
    assert.equal(conditional.status,304); assert.equal(await conditional.text(),'');
  }
});
test('publication does not implement writes or claim unrelated routes',async()=>{
  for(const base of origins) for(const method of ['POST','PUT','DELETE','PATCH']) {
    const response = await handle(new Request(base,{method})); assert.equal(response.status,405); assert.equal(response.headers.get('allow'),'GET, HEAD');
  }
  for(const url of ['https://briarwood.ai/','https://767-2676.com/','https://767-2676.com/mcp','https://767-2676.com/specification/v1','https://briarwood.ai/specification/v10','https://briarwood.ai/specification/v1/missing','https://unrelated.example/specification/v1']) assert.equal((await handle(new Request(url))).status,404,url);
});
test('stage hostname serves identical artifacts for both production path shapes',async()=>{
  for(const prefix of ['/specification/v1','/briarwood/specification/v1']) {
    const response=await handle(new Request('https://briarwood-specification.violetherod.workers.dev'+prefix));
    assert.equal(response.status,200); assert.equal(await response.text(),assets[''].body);
  }
});
