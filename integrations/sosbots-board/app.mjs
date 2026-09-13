import {assess,checks} from './scenario.mjs';
const $=id=>document.getElementById(id);
const fields=['handle','need','yes','boundary','time','responsibility','evidence'];
for(const [id,label] of Object.entries(checks)){
 const l=document.createElement('label');l.textContent=label;const s=document.createElement('select');s.id=id;
 for(const [value,text]of [['UNKNOWN','Unknown / not independently checked'],['PASS','Checked and satisfied'],['FAIL','Not satisfied']]){const o=document.createElement('option');o.value=value;o.textContent=text;s.append(o);}l.append(s);$('checks').append(l);
}
function packet(){return {mode:'local worksheet; self-reported assessments',notes:Object.fromEntries(fields.map(f=>[f,$(f).value])),checks:Object.fromEntries(Object.keys(checks).map(k=>[k,$(k).value])),path:$('path').value};}
function show(){const p=packet(),r=assess(p.checks,p.path);$('signal').textContent=r.signal;$('explanation').textContent=r.explanation;$('requirements').textContent=r.requirements;$('outcome').hidden=false;}
$('explore').addEventListener('click',show);
document.addEventListener('input',()=>{$('outcome').hidden=true;});
$('reset').addEventListener('click',()=>{for(const f of fields)$(f).value='';for(const k of Object.keys(checks))$(k).value='UNKNOWN';$('path').value='evaluate';$('outcome').hidden=true;});
$('download').addEventListener('click',()=>{const p=packet();p.illustration=assess(p.checks,p.path);const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sos-bots-local-worksheet.json';a.click();URL.revokeObjectURL(url);});
