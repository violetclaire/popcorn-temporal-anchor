import assert from 'node:assert/strict';

export function patchHomepage(before, html) {
  assert(html.startsWith('<!doctype html>'));
  assert(html.includes('id="operations-home"'));
  assert(!/<(?:a|nav|button|input|select|textarea|details|iframe|script|form)\b|\s(?:onclick|tabindex)=/i.test(html), 'Homepage must remain read-only with nothing clickable');
  const anchor = "const true_witness_default = {...index_default, async fetch(request,env,ctx) {\n  const url = new URL(request.url);";
  assert.equal(before.split(anchor).length, 2, 'Expected one current presentation wrapper');
  if (before.includes('// operations-homepage:2026-10-20')) {
    const start=before.indexOf('// operations-homepage:2026-10-20');
    assert.equal(before.indexOf('// operations-homepage:2026-10-20',start+1),-1);
    const lineStart=before.indexOf('    const page = withDiscoveryHeaders(discoveryDocumentResponse(request, ',start);
    const lineEnd=before.indexOf('\n',lineStart);
    assert(lineStart>start && lineEnd>lineStart);
    const original=before.slice(lineStart,lineEnd);
    const prefix='    const page = withDiscoveryHeaders(discoveryDocumentResponse(request, ';
    const suffix=', "text/html; charset=utf-8"));';
    assert(original.startsWith(prefix)&&original.endsWith(suffix));
    const previousHtml=JSON.parse(original.slice(prefix.length,-suffix.length));
    assert(previousHtml.includes('id="operations-home"'));
    const replacement=prefix+JSON.stringify(html)+suffix;
    const after=before.slice(0,lineStart)+replacement+before.slice(lineEnd);
    assert.equal(after.slice(0,lineStart)+original+after.slice(lineStart+replacement.length),before,'Only homepage HTML may change');
    return after;
  }
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
