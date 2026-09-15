import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';

// Build with Node 22.13+; the generated module and checker run on Node 20+.
const root = new URL('../../', import.meta.url);
const sources = ['verify/typescript/src/index.ts', 'packages/mcp/src/task-schedule.ts'];
const hash = value => createHash('sha256').update(value).digest('hex');
const raw = sources.map(path => fs.readFileSync(new URL(path, root), 'utf8'));
const compiled = raw.map(source => stripTypeScriptTypes(source, { mode: 'transform' }));
const pattern = /import \{ verifyPopcornWitnessEvidence \} from "\.\.\/\.\.\/\.\.\/verify\/typescript\/src\/index\.js";\r?\n/;
if (!pattern.test(compiled[1])) throw Error('Maintained verifier import changed; review bundling');
const body = '// Generated from maintained source by build.mjs. Do not edit.\n// Licensing and prior grants: https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/LICENSING.md\n' + compiled[0] + '\n' + compiled[1].replace(pattern, '');
fs.writeFileSync(new URL('verifier.mjs', import.meta.url), body);
fs.writeFileSync(new URL('sources.json', import.meta.url), JSON.stringify({
  sources: Object.fromEntries(sources.map((path, i) => [path, hash(raw[i])])),
  bundle_sha256: hash(body),
}, null, 2) + '\n');

// Rebuild the existing distribution from source, preserving its signed packet.
const packet = JSON.parse(fs.readFileSync(new URL('examples/task-schedule/packet.json', root)));
fs.writeFileSync(new URL('integrations/huggingface-space/sample.mjs', root),
  '// POPCORN free historical sample. Save as sample.mjs; Node 20+. No wallet or network calls.\n' +
  body + '\nconst taskSamplePacket=' + JSON.stringify(packet) + ';\n' +
  "process.stdout.write(JSON.stringify(await verifyTaskScheduleSample(taskSamplePacket),null,2)+'\\n');\n");
console.log('Rebuilt verifier.mjs, sources.json and the HF historical sample from maintained source.');
