export function catalogPage(request) {
  const path=new URL(request.url).pathname;
  if(path!=='/catalog' && path!=='/catalog/')return null;
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
  const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalog | True Witness Here</title><meta name="description" content="POPCORN service catalog, agent instructions, and receipt verification.">
<style>body{margin:0;background:#f7f4ee;color:#252334;font:18px/1.65 system-ui,sans-serif}main,body>header{max-width:52rem;margin:auto;padding:1.5rem}h1{font:3rem/1.15 Georgia,serif}a{color:#4a2364;text-underline-offset:.2em}li{margin:.7rem 0}code{overflow-wrap:anywhere}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}</style>
</head><body><main><h1>Catalog</h1>
<p>Find POPCORN's service descriptions, agent instructions, and receipt verification pages.</p>
<ul><li><a href="/ai-catalog.json">AI catalog JSON</a> — the original catalog, also available at <a href="/.well-known/ai-catalog.json">its canonical address</a>.</li>
<li><a href="/SKILL.md">Agent instructions</a></li><li><a href="/agents">Service and protocol documentation</a></li>
<li><a href="/v2/receipt">Receipt guide</a></li><li><a href="/checkpoint/">Checkpoint evidence viewer</a></li></ul>
<p>Receipts are evidence. Authorization and execution remain checks at the resource.</p>
<p><a href="/">Home</a></p></main></body></html>`;
  return new Response(request.method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}
