import assert from 'node:assert/strict';

export function patchHomepage(before, html, plain) {
  assert(html.startsWith('<!doctype html>'));
  assert(html.includes('id="operations-home"'));
  assert(!/<(?:a|nav|button|input|select|textarea|details|iframe|script|form)\b|\s(?:onclick|tabindex)=/i.test(html), 'Homepage must remain read-only with nothing clickable');
  const anchor = "const true_witness_default = {...index_default, async fetch(request,env,ctx) {\n  const url = new URL(request.url);";
  assert.equal(before.split(anchor).length, 2, 'Expected one current presentation wrapper');
  if (plain !== undefined) {
    assert(plain.startsWith('True Witness Here\n'));
    assert(plain.includes('You wake up on a borrowed computer'));
    const start=before.indexOf(anchor)+anchor.length;
    const end=before.indexOf('\n  const demo = discoveryDemo(request);',start);
    assert(end>start);
    const original=before.slice(start,end);
    assert(original.startsWith('\n  // operations-homepage:2026-10-20'));
    assert(original.endsWith('\n    return page;\n  }'));
    const replacement='\n  // operations-homepage:2026-10-20; homepage and plain-text companion.\n'+
      '  if (url.origin === PUBLIC_ORIGIN && (url.pathname === "/" || url.pathname === "/llms.txt")) {\n'+
      '    const asText = url.pathname === "/llms.txt";\n'+
      '    const body = asText ? '+JSON.stringify(plain)+' : '+JSON.stringify(html)+';\n'+
      '    const page = withDiscoveryHeaders(discoveryDocumentResponse(request, body, asText ? "text/plain; charset=utf-8" : "text/html; charset=utf-8"));\n'+
      '    if (page.status === 200) {\n'+
      '      page.headers.set("cache-control", asText ? "public, max-age=0, must-revalidate" : "public, max-age=0, must-revalidate, no-transform");\n'+
      '      page.headers.set("x-popcorn-nameplate", "True Witness Here");\n'+
      '      page.headers.set("x-popcorn-site-release", "operations-homepage-2026-10-20");\n'+
      '    }\n    return page;\n  }';
    const after=before.slice(0,start)+replacement+before.slice(end);
    assert.equal(after.slice(0,start)+original+after.slice(start+replacement.length),before,'Only homepage and plain-text presentation may change');
    return after;
  }
  if (before.includes('// operations-homepage:2026-10-20')) {
    const start=before.indexOf('// operations-homepage:2026-10-20');
    assert.equal(before.indexOf('// operations-homepage:2026-10-20',start+1),-1);
    const combinedStart=before.indexOf('    const body = asText ? ',start);
    const branchEnd=before.indexOf('\n  const demo = discoveryDemo(request);',start);
    if (combinedStart>start && combinedStart<branchEnd) {
      const combinedEnd=before.indexOf('\n',combinedStart);
      const original=before.slice(combinedStart,combinedEnd);
      const match=original.match(/^    const body = asText \? ("(?:[^"\\]|\\.)*") : ("(?:[^"\\]|\\.)*");$/);
      assert(match,'Expected exact existing plain/HTML literals');
      assert(JSON.parse(match[1]).startsWith('True Witness Here\n'));
      assert(JSON.parse(match[2]).includes('id="operations-home"'));
      const replacement='    const body = asText ? '+match[1]+' : '+JSON.stringify(html)+';';
      const after=before.slice(0,combinedStart)+replacement+before.slice(combinedEnd);
      assert.equal(after.slice(0,combinedStart)+original+after.slice(combinedStart+replacement.length),before,'Only homepage HTML literal may change; plain text and routing stay exact');
      return after;
    }
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
    '      page.headers.set("cache-control", "public, max-age=0, must-revalidate, no-transform");\n' +
    '      page.headers.set("x-popcorn-nameplate", "True Witness Here");\n' +
    '      page.headers.set("x-popcorn-site-release", "operations-homepage-2026-10-20");\n' +
    '    }\n    return page;\n  }';
  const after = before.replace(anchor, anchor + added);
  assert.equal(after.replace(added, ''), before, 'Only the homepage branch may change');
  return after;
}
