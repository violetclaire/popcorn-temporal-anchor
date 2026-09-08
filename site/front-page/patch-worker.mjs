import assert from 'node:assert/strict';

// Apply this patch only to freshly downloaded production source. Keep the backup.
export function patchFrontPage(before, files) {
  let source = before;
  const edits=[];
  function replaceOnce(oldText,newText) {
    assert.equal(source.split(oldText).length,2,'Expected one occurrence: '+oldText.slice(0,80));
    source=source.replace(oldText,newText); edits.push([oldText,newText]);
  }
  const start=source.indexOf('function handleHomepage(request) {');
  const end=source.indexOf('__name(handleHomepage, "handleHomepage");',start);
  assert.ok(start>=0 && end>start);
  const original=source.slice(start,end);
  replaceOnce(original,original.replace('renderTimePage(Date.now())',JSON.stringify(files['index.html'])));
  const ls=source.indexOf('function handleLlms(request) {');
  const le=source.indexOf('__name(handleLlms, "handleLlms");',ls);
  assert.ok(ls>=0 && le>ls);
  const llms=source.slice(ls,le);
  assert.equal(llms.split('    body,').length,2);
  replaceOnce(llms,llms.replace('    body,','    body + '+JSON.stringify('\n\n'+files['llms-addendum.txt'])+',').replace('"text/markdown; charset=utf-8"','"text/plain; charset=utf-8"'));
  const docs={
    '/pricing':['pricing.html','text/html; charset=utf-8'],
    '/terms':['terms.html','text/html; charset=utf-8'],
    '/tone-spec.v1.json':['tone-spec.v1.json','application/json; charset=utf-8'],
    '/signal.md':['signal.md','text/markdown; charset=utf-8']
  };
  const branch='    if (url.pathname === "/") {';
  const added=Object.entries(docs).map(([route,[file,type]])=>'    if (url.pathname === '+JSON.stringify(route)+') { return withDiscoveryHeaders(discoveryDocumentResponse(request, '+JSON.stringify(files[file])+', '+JSON.stringify(type)+')); }').join('\n')+'\n';
  replaceOnce(branch,added+branch);
  // Published service wording; retained signed sample bytes are never edited.
  for(const [a,b] of [
    ['        "booking",\n',''],
    ['booking_or_schedule: 3e4','schedule: 3e4'],
    ['before bookings, schedules, routing','before schedules, routing'],
    ['- a booking, schedule event, route','- a schedule event, route'],
    ['for a booking or schedule decision','for a schedule decision'],
    ['grounding for booking, scheduling, routing','grounding for scheduling, routing'],
    ['This sample does not authorize payment or booking.','This sample does not authorize payment or task execution.'],
    ['POPCORN hourly test line\\n','POPCORN saved test line (hourly run paused)\\n']
  ]) replaceOnce(a,b);
  let restored=source;
  for(const [a,b] of edits.toReversed()) {
    if(b==='') { // single removed capability value; restore at its unique neighbor.
      const anchor='      compatible_task_types: [\n';
      assert.equal(restored.split(anchor).length,2);
      restored=restored.replace(anchor,anchor+a);
    } else { assert.equal(restored.split(b).length,2,b.slice(0,80)); restored=restored.replace(b,a); }
  }
  assert.equal(restored,before,'Every source difference must be accounted for');
  return source;
}
