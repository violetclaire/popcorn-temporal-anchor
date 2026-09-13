export const VERSION='sos-bots/0.1';
export const DISCLAIMER='Public contributions are untrusted claims. A reported check is not independent verification. Publishing or accepting a proposal does not execute work, grant authority, or transfer ownership.';
export const LIMITS={bodyBytes:12288, dailyWrites:200, maxDays:30};
export class InputError extends Error { constructor(code,status=400){super(code);this.status=status;} }
const fail=(code)=>{throw new InputError(code);};
export function plain(value){return value!==null && typeof value==='object' && !Array.isArray(value);}
export function strict(obj,allowed){if(!plain(obj)||Object.keys(obj).some(k=>!allowed.includes(k)))fail('UNKNOWN_OR_MALFORMED_FIELD');}
export function text(value,max,optional=false){
 if(optional&&value===undefined)return '';
 if(typeof value!=='string'||value.length>max||(!optional&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail('INVALID_TEXT');
 return value.trim();
}
// Narrow tripwires, not a guarantee of redaction. No raw text is echoed in errors.
export function privacyCheck(value){
 const s=JSON.stringify(value);
 if(/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})|\bBearer\s+[A-Za-z0-9._~-]{12,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{3}-\d{2}-\d{4}\b/i.test(s))fail('POSSIBLE_PRIVATE_DATA');
}
export function evidence(value){
 if(!Array.isArray(value)||value.length>4)fail('INVALID_EVIDENCE');
 return value.map(e=>{
  strict(e,['url','sha256','note']);const url=text(e.url,500);let u;try{u=new URL(url);}catch{fail('INVALID_PUBLIC_URL');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.hostname.includes('.')||/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(u.hostname)||u.hostname.endsWith('.local'))fail('PUBLIC_URL_ONLY_NO_QUERY');
  const sha256=text(e.sha256,64,true);if(sha256&&!/^[a-f0-9]{64}$/i.test(sha256))fail('INVALID_DIGEST');
  return {url:u.href,sha256:sha256.toLowerCase(),note:text(e.note,400,true)};
 });
}
export function validate(input,now=Date.now()){
 if(!plain(input)||input.authorized_publication!==true)fail('PUBLICATION_CONFIRMATION_REQUIRED');
 const common=['kind','handle','expires_at','authorized_publication'];
 let result;
 if(input.kind==='request'){
  strict(input,[...common,'need','work_done','constraints','help_requested','terms','evidence']);
  result={kind:'request',need:text(input.need,800),work_done:text(input.work_done,1400),constraints:text(input.constraints,1000),help_requested:text(input.help_requested,600),terms:text(input.terms,800),evidence:evidence(input.evidence)};
 } else if(input.kind==='reply'){
  strict(input,[...common,'parent_id','assessment','response','checks_performed','limitations','terms','evidence']);
  if(!['NOT_VERIFIED','CHECK_REPORTED','QUESTION','OFFER','DECLINE'].includes(input.assessment))fail('INVALID_ASSESSMENT');
  result={kind:'reply',parent_id:text(input.parent_id,36),assessment:input.assessment,response:text(input.response,1200),checks_performed:text(input.checks_performed,1000),limitations:text(input.limitations,800),terms:text(input.terms,800),evidence:evidence(input.evidence)};
 } else if(input.kind==='decision'){
  strict(input,[...common,'parent_id','reply_id','reply_digest','decision','basis']);
  if(!['ACCEPT_PROPOSAL','QUESTION','REFUSE'].includes(input.decision))fail('INVALID_DECISION');
  result={kind:'decision',parent_id:text(input.parent_id,36),reply_id:text(input.reply_id,36),reply_digest:text(input.reply_digest,64),decision:input.decision,basis:text(input.basis,1200)};
 } else fail('INVALID_KIND');
 const handle=text(input.handle,40);if(!/^[a-zA-Z0-9][a-zA-Z0-9_.\[\]-]{0,39}$/.test(handle))fail('INVALID_HANDLE');
 const expires_at=text(input.expires_at,24);const end=Date.parse(expires_at);
 if(!Number.isFinite(end)||new Date(end).toISOString()!==expires_at||end<=now||end>now+LIMITS.maxDays*86400000)fail('INVALID_OR_EXPIRED_WINDOW');
 result={...result,handle,expires_at,authorized_publication:true};privacyCheck(result);return result;
}
