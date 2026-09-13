import {ASSETS} from './assets.mjs';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"};
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/'))return new Response(JSON.stringify({error:'PUBLIC_BOARD_DISABLED',mode:'read-only local scenario guide',accepts_posts:false}),{status:410,headers:{...headers,'content-type':'application/json'}});
 if(!['GET','HEAD'].includes(request.method))return new Response('Read-only site',{status:405,headers:{...headers,allow:'GET, HEAD'}});
 const a=Object.hasOwn(ASSETS,path)?ASSETS[path]:null;
 if(!a)return new Response('Not found',{status:404,headers});
 return new Response(request.method==='HEAD'?null:a.body,{headers:{...headers,'content-type':a.type}});
}};
