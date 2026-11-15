import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [snapshot,out]=process.argv.slice(2);
assert(snapshot&&out,'Usage: node prepare-release.mjs SNAPSHOT_DIRECTORY CANDIDATE_DIRECTORY');
assert(!fs.existsSync(out),'Candidate directory already exists');
const sha=b=>createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(path.join(snapshot,'index.js'),'utf8');
const anchor='const true_witness_default = {...index_default, async fetch(request,env,ctx) {';
assert.equal(original.split(anchor).length,2,'Unrecognized active Worker');
assert(!original.includes('readingEditions'),'Already applied');
function literals(s){
 const mark='const body = asText ? ',start=s.indexOf(mark);assert(start>=0);assert.equal(s.indexOf(mark,start+1),-1);
 function read(p){assert.equal(s[p],'"');let end=p+1;for(;end<s.length;end++){if(s[end]==='\\'){end++;continue;}if(s[end]==='"')break;}return {start:p,end:end+1,value:JSON.parse(s.slice(p,end+1))};}
 const text=read(start+mark.length);let p=text.end;while(/\s/.test(s[p]))p++;assert.equal(s[p++],':');while(/\s/.test(s[p]))p++;return {text,html:read(p)};
}
const old=literals(original),head='</header>';
const selector='<nav aria-label="Reading editions" style="padding:1rem 24px"><form action="/editions/open" method="get"><label for="reading-edition">Language or encoding </label><select id="reading-edition" name="edition" style="font:inherit;max-width:100%;padding:.5rem"><option value="index">All editions</option><option value="english">English text</option><option value="morse">Morse</option><option value="braille">English Braille</option><option value="brf">Braille-ready download</option><option value="nato">NATO phonetic</option><option value="languages">Other languages: coverage</option><option value="sign">Sign languages: not yet available</option><option value="voice">Scout voice: not yet available</option></select> <button style="font:inherit;padding:.5rem" type="submit">Open</button></form><form action="/editions/open" method="get"><label for="reading-name">Or type a name </label><input id="reading-name" name="name" maxlength="100" style="font:inherit;max-width:100%;padding:.5rem"> <button style="font:inherit;padding:.5rem" type="submit">Find edition</button></form><a href="/editions/">Reading editions and accessibility</a></nav>';
assert.equal(old.html.value.split(head).length,2);
assert.equal(old.html.value.split("form-action 'none'").length,2);
const home=old.html.value.replace(head,head+selector).replace("form-action 'none'","form-action 'self'");
assert.equal(home.replace(selector,'').replace("form-action 'self'","form-action 'none'"),old.html.value,'Existing homepage changed outside controls/CSP');
let source=original.slice(0,old.html.start)+JSON.stringify(home)+original.slice(old.html.end);
const route="\n  if (new URL(request.url).pathname === '/editions' || new URL(request.url).pathname.startsWith('/editions/')) return readingEditions.fetch(request);";
source="import readingEditions from './editions.mjs';\n"+source.replace(anchor,anchor+route);
const check=literals(source);
const reversed=(source.slice(0,check.html.start)+JSON.stringify(old.html.value)+source.slice(check.html.end)).replace("import readingEditions from './editions.mjs';\n",'').replace(anchor+route,anchor);
assert.equal(reversed,original,'Non-edition service code changed');
assert.equal(check.text.value,old.text.value,'llms index changed');
fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync(snapshot))fs.copyFileSync(path.join(snapshot,name),path.join(out,name));
fs.writeFileSync(path.join(out,'index.js'),source);
fs.writeFileSync(path.join(out,'home.html'),home);
const summary=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'build-summary.json')));
const modules=[];
for(const f of summary.files){const bytes=fs.readFileSync(path.join(import.meta.dirname,'dist',f.name));assert.equal(sha(bytes),f.sha256);const name='editions-'+f.name;fs.writeFileSync(path.join(out,name),bytes);modules.push({name,content_type:f.name.endsWith('.brf')?'application/octet-stream':'text/plain',sha256:sha(bytes),bytes:bytes.length});}
let module=fs.readFileSync(path.join(import.meta.dirname,'dist/worker.mjs'),'utf8');
for(const f of summary.files)module=module.replace(`from './${f.name}'`,`from './editions-${f.name}'`);
fs.writeFileSync(path.join(out,'editions.mjs'),module);
modules.push({name:'editions.mjs',content_type:'application/javascript+module',sha256:sha(module),bytes:Buffer.byteLength(module)});
const report={source:summary.source,original_worker_sha256:sha(original),candidate_worker_sha256:sha(source),homepage_before_sha256:sha(old.html.value),homepage_after_sha256:sha(home),homepage_before_bytes:Buffer.byteLength(old.html.value),homepage_after_bytes:Buffer.byteLength(home),new_modules:modules,existing_code_reversible:true,original_homepage_reversible:true,existing_text_index_unchanged:true};
fs.writeFileSync(path.join(out,'prepared.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,new_modules:modules.length},null,2));
