import assert from 'node:assert/strict';

export function patchHomepage(before, html) {
  assert(html.startsWith('<!doctype html>'));
  assert(html.includes('id="operations-home"'));
  assert(!/<(?:a|nav|button|input|select|textarea|details|iframe|script|form)\b|\s(?:onclick|tabindex)=/i.test(html), 'Homepage must remain read-only with nothing clickable');
  const anchor = "const true_witness_default = {...index_default, async fetch(request,env,ctx) {\n  const url = new URL(request.url);";
  assert.equal(before.split(anchor).length, 2, 'Expected one current presentation wrapper');
  assert(!before.includes('// operations-homepage:2026-10-20'));
  const added = '\n  // operations-homepage:2026-10-20; root presentation only.\n' +
    '  if (url.origin === PUBLIC_ORIGIN && url.pathname === "/") {\n' +
    '    const page = withDiscoveryHeaders(discoveryDocumentResponse(request, ' + JSON.stringify(html) + ', "text/html; charset=utf-8"));\n' +
    '    if (page.status === 200) {\n' +
    '      page.headers.set("cache-control", "public, max-age=0, must-revalidate");\n' +
    '      page.headers.set("x-popcorn-nameplate", "True Witness Here");\n' +
    '      page.headers.set("x-popcorn-site-release", "operations-homepage-2026-10-20");\n' +
    '    }\n    return page;\n  }';
  const after = before.replace(anchor, anchor + added);
  assert.equal(after.replace(added, ''), before, 'Only the homepage branch may change');
  return after;
}
