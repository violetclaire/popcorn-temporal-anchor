export function createHandler(assets) {
  return async function fetchSpecification(request) {
    const url = new URL(request.url);
    const prefixes = url.hostname === '767-2676.com'
      ? ['/briarwood/specification/v1']
      : url.hostname === 'briarwood.ai'
        ? ['/specification/v1']
        : url.hostname === 'briarwood-specification.violetherod.workers.dev'
          ? ['/specification/v1', '/briarwood/specification/v1']
          : [];
    const prefix = prefixes.find(value => url.pathname === value || url.pathname.startsWith(value + '/') || url.pathname === value + '.md');
    const suffix = prefix ? url.pathname.slice(prefix.length) : null;
    const asset = suffix === null ? null : assets[suffix];
    if (!asset) return new Response('Not found\n', {status: 404, headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'}});
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Read-only publication. Use GET or HEAD.\n', {status: 405, headers: {allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'}});
    }
    const headers = {
      'content-type': asset.content_type,
      'cache-control': 'public, max-age=31536000, immutable, no-transform',
      etag: '"' + asset.sha256 + '"',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'access-control-allow-origin': '*',
      'content-security-policy': asset.csp || "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    };
    if (request.headers.get('if-none-match') === headers.etag) return new Response(null, {status: 304, headers});
    headers['content-length'] = String(asset.bytes);
    return new Response(request.method === 'HEAD' ? null : asset.body, {status: 200, headers});
  };
}
