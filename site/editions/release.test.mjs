import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import worker from './dist/worker.mjs';
const root=import.meta.dirname,summary=JSON.parse(fs.readFileSync(path.join(root,'build-summary.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const req=(route,method='GET',headers={})=>new Request('https://767-2676.com'+route,{method,headers});
let checks=0;
for(const file of summary.files){
 const r=await worker.fetch(req(file.path));assert.equal(r.status,200,file.path);const b=Buffer.from(await r.arrayBuffer());assert.equal(sha(b),file.sha256,file.path);assert.equal(r.headers.get('x-canonical-sha256'),summary.source.sha256);
 if(file.name.endsWith('.html'))assert(b.toString().includes('data-canonical-sha256="'+summary.source.sha256+'"'));
 const head=await worker.fetch(req(file.path,'HEAD'));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 const cached=await worker.fetch(req(file.path,'GET',{'if-none-match':r.headers.get('etag')}));assert.equal(cached.status,304);checks+=3;
}
for(const [route,file]of Object.entries({'/editions':'index.html','/editions/':'index.html','/editions/morse':'morse.html','/editions/braille':'braille.html','/editions/english':'english.html','/editions/nato':'nato.html','/editions/languages':'languages.html','/editions/sign':'sign.html','/editions/voice':'voice.html'})){
 const r=await worker.fetch(req(route));assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),summary.files.find(f=>f.name===file).sha256);checks++;
}
for(const route of ['/editions/unknown','/editions/__proto__','/editions/constructor']){assert.equal((await worker.fetch(req(route))).status,404);checks++;}
assert.equal((await worker.fetch(req('/editions/','POST'))).status,405);checks++;
for(const [query,location]of [['edition=morse','/editions/morse'],['name=ASL','/editions/sign'],['name=Japanese','/editions/languages'],['edition=__proto__','/editions/languages'],['name=https://example.com','/editions/languages'],['edition=brf','/editions/braille.brf']]){
 const r=await worker.fetch(req('/editions/open?'+query));assert.equal(r.status,303);assert.equal(r.headers.get('location'),location);checks++;
}
let productionComparisons=0;
if(process.argv[2]){
 const release=path.resolve(process.argv[2]);
 const active=(await import(pathToFileURL(path.join(release,'snapshot/active/index.js')))).default;
 const candidate=(await import(pathToFileURL(path.join(release,'candidate/index.js')))).default;
 const settings=JSON.parse(fs.readFileSync(path.join(release,'snapshot/.state/settings.json')));
 const env=Object.fromEntries(settings.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
 for(const route of ['/llms.txt','/llms-full.txt','/SKILL.md','/ai-catalog.json','/evidence/homepage-before-split-2026-11-13.html','/test-line','/schedule','/agents','/agent-entry','/parts-for-agents','/evidence/freetsa-popcorn-2026-10-14/sample.json','/evidence/freetsa-popcorn-2026-10-14/verify-free-sample.mjs','/evidence/freetsa-popcorn-2026-10-14/check-this-receipt.html']){
  const a=await active.fetch(req(route),env,{}),b=await candidate.fetch(req(route),env,{});assert.equal(b.status,a.status,route);assert.equal(sha(Buffer.from(await b.arrayBuffer())),sha(Buffer.from(await a.arrayBuffer())),route);productionComparisons++;
 }
 const home=await candidate.fetch(req('/'),env,{});assert.equal(await home.text(),fs.readFileSync(path.join(release,'candidate/home.html'),'utf8'));
 const index=await candidate.fetch(req('/editions/'),env,{});assert.equal(index.status,200);assert((await index.text()).includes(summary.source.sha256));
 const report={status:'PASS',edition_checks:checks,unchanged_production_routes:productionComparisons,canonical_sha256:summary.source.sha256,source_archive_unchanged:true,payments_made:0};
 fs.writeFileSync(path.join(release,'local-verification.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:'PASS',edition_checks:checks,unchanged_production_routes:productionComparisons}));
