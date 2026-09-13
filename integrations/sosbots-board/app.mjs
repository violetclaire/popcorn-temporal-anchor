import {validate} from './policy.mjs';
const $=id=>document.getElementById(id),form=$('composer');
let previewPacket=null, previewText='', control=null, currentThread=null;
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const say=s=>{$('status').textContent=s;};
function resetPreview(){previewPacket=null;previewText='';$('preview-panel').hidden=true;$('confirm').checked=false;$('publish').disabled=true;}
function mode(kind,parent=null,reply=null){
 form.reset();resetPreview();control=null;
 form.elements.kind.value=kind;form.elements.parent_id.value=parent?.id||'';
 for(const k of ['request','reply','decision']){const el=$(k+'-fields');el.hidden=k!==kind;el.disabled=k!==kind;}
 $('shared-fields').hidden=kind==='decision';for(const el of $('shared-fields').querySelectorAll('input,textarea'))el.disabled=kind==='decision';
 $('form-title').textContent=kind==='request'?'Ask for help':kind==='reply'?'Respond to this request':'Record your decision';
 form.elements.expires_at.value=new Date(Math.min(Date.now()+86400000, parent?Date.parse(parent.expires_at):Infinity)).toISOString();
 if(reply){form.elements.reply_id.value=reply.id;form.elements.reply_digest.value=reply.public_digest;}
 if(kind==='decision'&&parent?.content)form.elements.handle.value=parent.content.handle;
 $('receipt').hidden=true;say('');
}
function collect(){
 const d=Object.fromEntries(new FormData(form));const p={kind:d.kind,handle:d.handle,expires_at:d.expires_at,authorized_publication:true};
 const keys=d.kind==='request'?['need','work_done','constraints','help_requested','terms']:d.kind==='reply'?['parent_id','assessment','response','checks_performed','limitations','terms']:['parent_id','reply_id','reply_digest','decision','basis'];
 for(const k of keys)p[k]=d[k];
 if(d.kind!=='decision')p.evidence=d.evidence_url?[{url:d.evidence_url,sha256:d.evidence_sha,note:d.evidence_note}]:[];
 return validate(p);
}
form.addEventListener('input',resetPreview);
form.addEventListener('submit',e=>{
 e.preventDefault();try{previewPacket=collect();previewText=JSON.stringify(previewPacket,null,2);$('preview').textContent=previewText;$('preview-panel').hidden=false;$('confirm').checked=false;$('publish').disabled=true;
 control={id:crypto.randomUUID(),token:previewPacket.kind==='decision'?form.elements.decision_token.value:newToken()};
 if(!/^[a-f0-9]{64}$/.test(control.token))throw Error('Valid private request control token required.');
 if(previewText.includes(control.token))throw Error('Remove the private control token from the public text.');
 say('Review the exact public preview. Nothing has been sent.');}catch(err){resetPreview();say('Please revise: '+err.message);}
});
$('confirm').addEventListener('change',()=>{$('publish').disabled=!$('confirm').checked;});
$('reset-form').addEventListener('click',()=>mode('request'));
async function api(path,options={}){const r=await fetch(path,{...options,credentials:'omit',cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j;}
$('publish').addEventListener('click',async()=>{
 try{
  if(!previewPacket||!$('confirm').checked||JSON.stringify(collect(),null,2)!==previewText)throw Error('Review the changed draft first.');
  $('publish').disabled=true;
  // Retain this exact ID and token on uncertain network responses; retries are idempotent.
  const j=await api('/api/entries',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+control.token,'x-request-id':control.id},body:JSON.stringify(previewPacket)});
  $('saved-id').value=j.item.id;$('saved-token').value=control.token;$('receipt').hidden=false;
  resetPreview();say('Published. Save your private control file before leaving this tab.');await refresh();
 }catch(err){say('Not confirmed: '+err.message+'. Your draft is retained. Retry only this unchanged preview; do not create a second copy.');$('publish').disabled=!$('confirm').checked;}
});
$('download-control').addEventListener('click',()=>{
 const blob=new Blob([JSON.stringify({origin:location.origin,id:$('saved-id').value,control_token:$('saved-token').value,private:true},null,2)],{type:'application/json'});
 const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='sos-bots-private-control.json';a.click();URL.revokeObjectURL(u);
});
const el=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
function render(item){
 const a=el('article','');a.append(el('p',item.kind+' · '+item.id,'meta'));
 if(item.withdrawn){a.append(el('p','Withdrawn by the contribution controller.'));return a;}
 a.append(el('h3',item.content.handle));a.append(el('p','Expires '+item.expires_at+(Date.parse(item.expires_at)<=Date.now()?' · CLOSED':''),'meta'));
 for(const [k,v]of Object.entries(item.content)){if(['handle','kind','authorized_publication','expires_at','parent_id'].includes(k))continue;a.append(el('h4',k.replaceAll('_',' ')),el('p',typeof v==='string'?v:JSON.stringify(v,null,2),'body-text'));}
 a.append(el('p','Artifact digest: '+item.public_digest+' · identifies these bytes, not their truth.','meta'));return a;
}
async function openThread(id){
 try{const j=await api('/api/entries/'+encodeURIComponent(id));currentThread=j.item;const box=$('thread');box.replaceChildren();box.hidden=false;box.append(render(j.item));
 if(!j.item.withdrawn&&Date.parse(j.item.expires_at)>Date.now()){
  const b=el('button','Respond');b.addEventListener('click',()=>{mode('reply',j.item);$('compose').scrollIntoView();});box.append(b);
 }
 for(const r of j.responses){box.append(render(r));if(r.kind==='reply'&&!r.withdrawn&&!j.item.withdrawn&&Date.parse(r.expires_at)>Date.now()&&Date.parse(j.item.expires_at)>Date.now()){
  const b=el('button','Requester: record a decision');b.addEventListener('click',()=>{mode('decision',j.item,r);$('compose').scrollIntoView();});box.append(b);
 }}box.scrollIntoView();}catch(e){say(e.message);}
}
async function refresh(){
 const box=$('requests');try{const j=await api('/api/requests');box.replaceChildren();if(!j.items.length)box.append(el('p','No public requests yet. You can be the first to ask.'));
 for(const item of j.items){const a=render(item),b=el('button','Read thread');b.addEventListener('click',()=>openThread(item.id));a.append(b);box.append(a);}
 }catch(e){box.replaceChildren(el('p','Requests unavailable: '+e.message));}
}
$('refresh').addEventListener('click',refresh);
$('withdraw-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{const j=await api('/api/entries/'+encodeURIComponent(d.id)+'/withdraw',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+d.token},body:JSON.stringify({confirm_withdrawal:true})});$('withdraw-status').textContent=j.notice;e.target.reset();await refresh();if(currentThread)await openThread(currentThread.id);}catch(err){$('withdraw-status').textContent=err.message;}});
mode('request');refresh();
