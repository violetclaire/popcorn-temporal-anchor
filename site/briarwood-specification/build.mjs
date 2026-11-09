import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root = import.meta.dirname;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function build() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'source-lock.json'), 'utf8'));
  assert.equal(lock.version, 1);
  const documents = lock.documents.map(document => {
    const bytes = fs.readFileSync(path.join(root, 'documents', document.file));
    assert.equal(bytes.length, document.bytes, document.file + ': source byte count');
    assert.equal(sha256(bytes), document.sha256, document.file + ': immutable source hash');
    assert.equal(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'), document.source_git_blob, document.file + ': Git source blob');
    const text = bytes.toString('utf8');
    assert.deepEqual(Buffer.from(text, 'utf8'), bytes, document.file + ': valid UTF-8');
    return {...document, text};
  });
  const css = `:root{color-scheme:dark;background:#153d32;color:#f3eddd;font-family:Georgia,'Times New Roman',serif}*{box-sizing:border-box}body{margin:0}main{max-width:78ch;margin:auto;padding:clamp(1.25rem,5vw,4rem) clamp(1.1rem,4vw,3rem) 5rem}header{padding-bottom:2.5rem;border-bottom:1px solid #94ad99}h1{font-size:clamp(2.2rem,6vw,3.7rem);line-height:1.1;margin:.5rem 0 1rem;font-weight:400}h2{font-size:1.7rem;font-weight:400}p{line-height:1.65}section{margin-top:3rem}.eyebrow,.metadata,footer{font-family:system-ui,sans-serif;font-size:.85rem;line-height:1.65}.eyebrow{letter-spacing:.14em;text-transform:uppercase}.metadata{color:#cbd9cb;overflow-wrap:anywhere}.policy{padding:1rem 1.2rem;border-left:2px solid #c4bc85;background:#1a4639}pre{font-family:Georgia,'Times New Roman',serif;font-size:1.05rem;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;margin:1.5rem 0 0}footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #94ad99;overflow-wrap:anywhere}@media print{:root{color-scheme:light;background:white;color:#111}main{max-width:none;padding:0}.metadata{color:#333}.policy{background:none}section{break-before:auto}}`;
  const suffixes = ['.md', '/addendum-1.md', '/addendum-2.md'];
  const human = 'https://briarwood.ai/specification/v1';
  const agent = 'https://767-2676.com/briarwood/specification/v1';
  const headings = ['Specification v1', 'Addendum 1 — evidence format', 'Addendum 2 — clarifications'];
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no,email=no,address=no"><title>Briarwood — Specification v1</title><style>${css}</style></head><body><main><header><div class="eyebrow">Briarwood · Published record</div><h1>Specification v1</h1><p>October 21, 2026. The rules of Briarwood, with both addenda, in full.</p><p class="metadata">Build status: specification publication. The catalog and strike checker belong to later build steps.</p><div class="policy"><p>Change rule: amendments are published as new versions. Earlier versions remain available at their versioned addresses.</p><p>Reading order: Specification v1, Addendum 1, then Addendum 2. Where the addenda conflict, Addendum 2 governs. The original documents below remain exact.</p></div></header>${documents.map((document,i)=>`<section aria-labelledby="heading-${document.id}"><h2 id="heading-${document.id}">${headings[i]}</h2><div class="metadata">${document.bytes} UTF-8 bytes · SHA-256 ${document.sha256}<br>Exact source: ${human + suffixes[i]}<br>Agent copy: ${agent + suffixes[i]}</div><pre data-document="${document.id}">${escape(document.text)}</pre></section>`).join('')}<footer><p>This complete publication: ${human}<br>Agent publication: ${agent}<br>Version and source record: ${human}/manifest.json</p></footer></main></body></html>\n`;
  const manifest = {
    publication: 'Briarwood Specification v1', version: 1, date: lock.date,
    change_rule: 'Amendments are new published versions; earlier versions stay reachable at their versioned addresses.',
    precedence: ['specification-v1', 'addendum-1', 'addendum-2'],
    precedence_note: 'Addendum 2 governs where it conflicts with Addendum 1. Original source bytes are not consolidated or rewritten.',
    source_repository: lock.source_repository,
    pages: {human, agent, bytes: Buffer.byteLength(html), sha256: sha256(html)},
    documents: documents.map(({text,...document},i)=>({...document, human_url: human + suffixes[i], agent_url: agent + suffixes[i]}))
  };
  const record = (body, content_type, csp) => ({body, content_type, bytes: Buffer.byteLength(body), sha256: sha256(body), ...(csp ? {csp} : {})});
  const styleHash = createHash('sha256').update(css).digest('base64');
  const assets = {'': record(html, 'text/html; charset=utf-8', `default-src 'none'; style-src 'sha256-${styleHash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`)};
  assets['/'] = assets[''];
  documents.forEach((document,i)=>{assets[suffixes[i]] = record(document.text, 'text/plain; charset=utf-8');});
  assets['/manifest.json'] = record(JSON.stringify(manifest,null,2)+'\n', 'application/json; charset=utf-8');
  const output = path.join(root, 'dist');
  fs.mkdirSync(output, {recursive:true});
  fs.writeFileSync(path.join(output, 'index.html'), html);
  fs.writeFileSync(path.join(output, 'manifest.json'), assets['/manifest.json'].body);
  const runtime = fs.readFileSync(path.join(root, 'handler.mjs'), 'utf8');
  const worker = runtime + '\nconst ASSETS = ' + JSON.stringify(assets) + ';\nexport default {fetch: createHandler(ASSETS)};\n';
  fs.writeFileSync(path.join(output, 'worker.mjs'), worker);
  // Keep the deployment entry in its own directory: Wrangler's no-bundle
  // discovery otherwise uploads adjacent HTML as an extra text module.
  fs.mkdirSync(path.join(output, 'upload'), {recursive:true});
  fs.writeFileSync(path.join(output, 'upload', 'worker.mjs'), worker);
  const buildRecord = {version:1, module:{name:'worker.mjs',bytes:Buffer.byteLength(worker),sha256:sha256(worker)},pages:manifest.pages,documents:manifest.documents,routes:Object.entries(assets).map(([suffix,{body,csp,...asset}])=>({suffix,...asset}))};
  fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(buildRecord,null,2)+'\n');
  return {assets, manifest, buildRecord};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(build().buildRecord,null,2));
