// Additive public routes. The existing Worker retains all operational routes.
export function createAgentEntryHandler(assets) {
  return function handleAgentEntry(request) {
    const asset = assets[new URL(request.url).pathname];
    if (!asset || !["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
    const headers = new Headers({
      "Content-Type": asset.type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Link": '</SKILL.md>; rel="service-desc"; type="text/markdown", </agent/offer>; rel="service-desc"; type="application/json", </.well-known/agent.json>; rel="agent-manifest", </demo>; rel="alternate"; type="text/html"',
    });
    if (asset.type.startsWith("text/html")) {
      headers.set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'");
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    return new Response(request.method === "HEAD" ? null : asset.body, { status: 200, headers });
  };
}
