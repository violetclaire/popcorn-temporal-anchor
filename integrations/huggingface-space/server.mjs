import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const files=new Map([
 ['/', ['README.md','text/plain; charset=utf-8']],
 ['/agents.md',['agents.md','text/markdown; charset=utf-8']],
 ['/SKILL.md',['agents.md','text/markdown; charset=utf-8']],
 ['/sample.mjs',['sample.mjs','text/javascript; charset=utf-8']],
 ['/packet.json',['packet.json','application/json; charset=utf-8']]
].map(([route,[file,type]])=>[route,{body:readFileSync(new URL(file,import.meta.url)),type}]));
export function createSampleServer(){return createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const asset=files.get(path);
 if(!asset){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{allow:'GET, HEAD'});res.end();return;}
 res.writeHead(200,{'content-type':asset.type,'access-control-allow-origin':'*','x-content-type-options':'nosniff'});
 res.end(req.method==='HEAD'?undefined:asset.body);
 });}
if(process.argv[1]===fileURLToPath(import.meta.url))createSampleServer().listen(Number(process.env.PORT||7860),'0.0.0.0');
