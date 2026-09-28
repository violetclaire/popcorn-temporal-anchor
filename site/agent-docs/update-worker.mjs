import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
export const documentation=fs.readFileSync(path.join(root,'docs/witness-layer.md'),'utf8').trim();
export const routes=['/agents','/agent-entry','/llms.txt','/agent-entry.md','/agents.md'];
const markerStart='<!-- witness-layer:start -->';
const markerEnd='<!-- witness-layer:end -->';
const esc=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function inline(text){
  return esc(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/[\x60]([^\x60]+)[\x60]/g,'<code>$1</code>').replace(/https:\/\/[^\s<]+/g,url=>{
    const target=url.replace(/[.,;!?]+$/,'');
    return target.includes('{')?url:'<a href="'+target+'">'+target+'</a>'+url.slice(target.length);
  });
}
export function renderDocumentation(){
  const blocks=documentation.split(/\n\s*\n/);
  let html='<section id="how-agents-use-witness-layer" aria-labelledby="witness-layer-title" style="grid-column:1 / -1;overflow-wrap:anywhere;line-height:1.6">';
  let inList=false;
  for(const block of blocks){
    if(block.startsWith('## ')){html+='<h2 id="witness-layer-title">'+inline(block.slice(3))+'</h2>';continue;}
    if(/^\d+\.\s/.test(block)){html+=inList?'</li>':'<ol>';inList=true;html+='<li><p>'+inline(block.replace(/^\d+\.\s/,''))+'</p>';continue;}
    if(inList&&!/^\s/.test(block)){html+='</li></ol>';inList=false;}
    html+='<p>'+inline(block.trim())+'</p>';
  }
  if(inList)html+='</li></ol>';
  return html+'</section>';
}
export function splitAssets(source){
  const prefix='var TASK_SCHEDULE_PUBLIC_ASSETS = ';
  const start=source.indexOf(prefix);
  assert.ok(start>=0,'Public asset map missing');
  assert.equal(source.indexOf(prefix,start+prefix.length),-1,'Multiple public asset maps');
  const end=source.indexOf('\n',start);
  assert.ok(end>start,'Public asset map must occupy one line');
  return {start,end,prefix,assets:JSON.parse(source.slice(start+prefix.length,end).replace(/;\r?$/,''))};
}
function insert(body,content,anchor){
  const marked=markerStart+'\n'+content+'\n'+markerEnd+'\n';
  if(body.includes(markerStart)){
    assert.equal(body.split(markerStart).length,2);
    const start=body.indexOf(markerStart),end=body.indexOf(markerEnd,start);
    assert.ok(end>start);
    return body.slice(0,start)+marked.trimEnd()+body.slice(end+markerEnd.length);
  }
  assert.equal(body.split(anchor).length,2,'Documentation insertion anchor must occur exactly once: '+anchor);
  return body.replace(anchor,marked+anchor);
}
export function updateWorker(source){
  const parsed=splitAssets(source),assets=structuredClone(parsed.assets),html=renderDocumentation();
  assets['/agents'].body=insert(assets['/agents'].body,html,'<section class="details">');
  assets['/agent-entry'].body=insert(assets['/agent-entry'].body,html,'<section><h2>1. See what the receipt does</h2>');
  assets['/llms.txt'].body=insert(assets['/llms.txt'].body,documentation,'## Time evidence and authorization expiry');
  for(const route of ['/agent-entry.md','/agents.md'])assets[route].body=insert(assets[route].body,documentation,'## 1. See two free samples');
  for(const key of Object.keys(assets))if(!routes.includes(key))assert.deepEqual(assets[key],parsed.assets[key],key);
  return source.slice(0,parsed.start)+parsed.prefix+JSON.stringify(assets)+';'+source.slice(parsed.end);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const target=path.resolve(process.argv[2]||path.join(root,'worker/production/index.js'));
  const source=fs.readFileSync(target,'utf8');
  fs.writeFileSync(target,updateWorker(source));
  console.log('Updated agent documentation: '+routes.join(', '));
}
