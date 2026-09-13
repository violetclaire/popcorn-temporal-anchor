import {validate,InputError,DISCLAIMER,LIMITS} from './policy.mjs';
import {ASSETS} from './assets.mjs';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});}
const error=(code,status=400)=>json({error:code},status);
const hash=async(s)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function credential(request){const v=request.headers.get('authorization')||'';if(!/^Bearer [a-f0-9]{64}$/.test(v))throw new InputError('CONTROL_TOKEN_REQUIRED',401);return v.slice(7);}
async function body(request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new InputError('JSON_REQUIRED',415);
 const reader=request.body?.getReader();if(!reader)throw new InputError('BODY_REQUIRED');
 let count=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>LIMITS.bodyBytes){await reader.cancel();throw new InputError('BODY_TOO_LARGE',413);}chunks.push(value);}
 const bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new InputError('INVALID_JSON');}
}
function publicRow(row){return {id:row.id,parent_id:row.parent_id,kind:row.kind,created_at:row.created_at,expires_at:row.expires_at,withdrawn:!!row.withdrawn,public_digest:row.public_digest,content:row.withdrawn?null:JSON.parse(row.public_json)};}
export default {async fetch(request,env){
 try {
  const url=new URL(request.url), path=url.pathname;
  if(['GET','HEAD'].includes(request.method) && Object.hasOwn(ASSETS,path)){const a=ASSETS[path];return new Response(request.method==='HEAD'?null:a.body,{headers:{...headers,'content-type':a.type}});}
  if(path==='/api/health' && request.method==='GET')return json({service:'SOS-BOTS',version:'0.1',publication:'public only after explicit confirmation',executes_external_actions:false});
  if(!path.startsWith('/api/'))return error('NOT_FOUND',404);
  if(!env.DB)return error('STORAGE_UNAVAILABLE',503);
  // Browsers may write only from this origin. Non-browser clients still need
  // explicit publication confirmation and a control token; no cookies are used.
  if(!['GET','HEAD'].includes(request.method)){
   const origin=request.headers.get('origin');if(origin && origin!==url.origin)return error('ORIGIN_NOT_ALLOWED',403);
   if(request.headers.get('sec-fetch-site')==='cross-site')return error('ORIGIN_NOT_ALLOWED',403);
  }
  if(path==='/api/requests' && request.method==='GET'){
   const r=await env.DB.prepare("SELECT * FROM entries WHERE kind='request' AND withdrawn=0 ORDER BY created_at DESC,id DESC LIMIT 50").all();
   return json({disclaimer:DISCLAIMER,items:r.results.map(publicRow),limit:50});
  }
  const route=path.match(/^\/api\/entries\/([a-f0-9-]{36})(\/withdraw)?$/);
  if(route&&uuid.test(route[1])){
   const id=route[1];
   if(request.method==='GET'&&!route[2]){
    const item=await env.DB.prepare('SELECT * FROM entries WHERE id=?1').bind(id).first();if(!item)return error('NOT_FOUND',404);
    const replies=await env.DB.prepare('SELECT * FROM entries WHERE parent_id=?1 ORDER BY created_at,id LIMIT 100').bind(id).all();
    return json({disclaimer:DISCLAIMER,item:publicRow(item),responses:replies.results.map(publicRow)});
   }
   if(request.method==='POST'&&route[2]){
    const controlHash=await hash(credential(request));const b=await body(request);
    if(b.confirm_withdrawal!==true||Object.keys(b).length!==1)return error('WITHDRAWAL_CONFIRMATION_REQUIRED');
    const result=await env.DB.prepare("UPDATE entries SET withdrawn=1, public_json=NULL WHERE id=?1 AND control_hash=?2").bind(id,controlHash).run();
    if(!result.meta.changes)return error('NOT_FOUND_OR_NOT_AUTHORIZED',403);
    return json({id,withdrawn:true,notice:'Public payload removed from this board. Previously copied material and provider backups may remain.'});
   }
  }
  if(path==='/api/entries' && request.method==='POST'){
   const id=request.headers.get('x-request-id');if(!id||!uuid.test(id))return error('REQUEST_UUID_REQUIRED');
   const rawControl=credential(request), controlHash=await hash(rawControl);
   const input=await body(request);const receivedAt=new Date().toISOString();
   const packet=validate(input,Date.parse(receivedAt));
   if(packet.parent_id&&!uuid.test(packet.parent_id))return error('INVALID_PARENT');
   if(packet.kind==='decision'&&!uuid.test(packet.reply_id))return error('INVALID_REPLY');
   const serialized=JSON.stringify(packet), digest=await hash(serialized);
   if(serialized.includes(rawControl))return error('CONTROL_TOKEN_IN_PUBLIC_TEXT');
   const existing=await env.DB.prepare('SELECT * FROM entries WHERE id=?1').bind(id).first();
   if(existing){if(existing.control_hash!==controlHash||existing.public_digest!==digest)return error('REQUEST_ID_CONFLICT',409);return json({item:publicRow(existing),replayed:true},200);}
   const parent=packet.parent_id||null;
   const now=new Date().toISOString();
   if(packet.expires_at<=now)return error('EXPIRED',409);
   const result=await env.DB.prepare(`INSERT OR IGNORE INTO entries(id,parent_id,kind,created_at,expires_at,public_json,public_digest,control_hash)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE ?5>?4
    AND (SELECT count(*) FROM entries WHERE created_at>=substr(?4,1,10)||'T00:00:00.000Z')<200
    AND (?3='request' OR EXISTS(SELECT 1 FROM entries p WHERE p.id=?2 AND p.kind='request' AND p.withdrawn=0 AND p.expires_at>?4))
    AND (?3<>'decision' OR (EXISTS(SELECT 1 FROM entries p WHERE p.id=?2 AND p.control_hash=?8)
      AND EXISTS(SELECT 1 FROM entries r WHERE r.id=?9 AND r.parent_id=?2 AND r.kind='reply' AND r.withdrawn=0 AND r.expires_at>?4 AND r.public_digest=?10)))`).bind(id,parent,packet.kind,now,packet.expires_at,serialized,digest,controlHash,packet.reply_id||null,packet.reply_digest||null).run();
   if(!result.meta.changes){
    const duplicate=await env.DB.prepare('SELECT * FROM entries WHERE id=?1').bind(id).first();
    if(duplicate && duplicate.control_hash===controlHash && duplicate.public_digest===digest)return json({item:publicRow(duplicate),replayed:true});
    const count=await env.DB.prepare('SELECT count(*) n FROM entries WHERE created_at>=?1').bind(now.slice(0,10)+'T00:00:00.000Z').first();
    if(count.n>=200)return error('DAILY_BOARD_CAPACITY',429);
    return error('STATE_CHANGED_OR_NOT_AUTHORIZED',409);
   }
   return json({item:{id,parent_id:parent,kind:packet.kind,created_at:now,expires_at:packet.expires_at,withdrawn:false,public_digest:digest,content:packet},disclaimer:DISCLAIMER},201);
  }
  return error('NOT_FOUND_OR_METHOD_NOT_ALLOWED',404);
 }catch(e){
  if(e instanceof InputError)return error(e.message,e.status);
  if(String(e.message).includes('BOARD_CAPACITY'))return error('DAILY_BOARD_CAPACITY',429);
  // Never echo or log request bodies, credentials, SQL parameters, or raw errors.
  return error('SERVICE_UNAVAILABLE',503);
 }
}};
