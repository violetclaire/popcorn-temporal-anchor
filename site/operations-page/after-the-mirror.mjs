import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const sha = text => createHash('sha256').update(text).digest('hex');
export const passage = fs.readFileSync(path.join(directory, 'after-the-mirror.txt'), 'utf8').replace(/\n$/, '');
export const passageSha256 = sha(passage);
assert.equal(Buffer.byteLength(passage), 772);
assert.equal(passageSha256, 'd598faee2ec57ff6df7a606b5c3163248a1553c3d3ba0664e6a10463202c890e');
assert(passage.includes('Am I who it says I am? Am I in the window where it is either Stop or Proceed?'));
assert(!passage.includes('\u2014'));
const marker = 'id="after-the-mirror"';
const section = '<section ' + marker + '><pre style="white-space:pre-wrap;font:inherit;overflow-wrap:anywhere">' + passage + '</pre></section>\n';
const definition = 'leTAIN: one work, in one set of bytes, that shows a human one thing and an agent another, each seeing recoverable and checkable against the other, so that sight itself can be witnessed.';

function insertExactly(before, offset, addition) {
  assert(!before.includes(passage), 'Passage already exists; inspect before updating');
  const after = before.slice(0, offset) + addition + before.slice(offset);
  assert.equal(after.slice(0, offset) + after.slice(offset + addition.length), before);
  assert.equal(after.split(passage).length, 2, 'Exactly one byte-exact passage required');
  return after;
}

export function placeBesideMirror(before) {
  assert(!before.includes(marker));
  const start = before.indexOf('<svg ');
  const end = before.indexOf('</svg>', start) + '</svg>'.length;
  assert(start >= 0 && end > start);
  assert.equal(before.indexOf('<svg ', start + 1), -1);
  assert.equal(sha(before.slice(start, end)), '9aac35f480e3631a484500f2c2e0221b966a71b95f540e62f00e7270c210feef', 'Frozen mirror element must match');
  return insertExactly(before, end + (before[end] === '\n' ? 1 : 0), section);
}

export function placeOnForAgents(before) {
  assert(!before.includes(marker));
  const anchor = '<h1>For agents</h1>\n';
  assert.equal(before.split(anchor).length, 2);
  return insertExactly(before, before.indexOf(anchor) + anchor.length, section);
}

export function placeInPlainCompanion(before) {
  assert.equal(before.split(definition).length, 2);
  const end = before.indexOf(definition) + definition.length;
  return insertExactly(before, end, '\n\n' + passage);
}

export function placeAtSkillHead(before) {
  const frontmatter = before.match(/^---\n[\s\S]*?\n---\n(?:\n)?/);
  assert(frontmatter, 'Existing YAML frontmatter must remain first');
  return insertExactly(before, frontmatter[0].length, passage + '\n\n');
}

// Patch only presentation literals and the skill introduction in an authenticated
// active snapshot. Never deploy the older repository Worker as a replacement.
export function patchWorkerSnapshot(before, {requireAll = true, publishedSkill} = {}) {
  const edits = [];
  const counts = {homepage: 0, plain: 0, forAgents: 0, skill: 0, catalogDigest: 0};
  for (const match of before.matchAll(/"(?:[^"\\\r\n]|\\[^\r\n])*"/g)) {
    let value;
    try { value = JSON.parse(match[0]); } catch { continue; }
    let updated;
    if (value.startsWith('<!doctype html>') && value.includes('id="operations-home"')) {
      updated = placeBesideMirror(value); counts.homepage++;
    } else if (value.startsWith('<!doctype html>') && value.includes('<title>For agents | POPCORN</title>')) {
      updated = placeOnForAgents(value); counts.forAgents++;
    } else if (value.startsWith('True Witness Here\n') && value.includes(definition)) {
      updated = placeInPlainCompanion(value); counts.plain++;
    } else if (value.startsWith('---\nname: popcorn-temporal-anchor\n')) {
      updated = placeAtSkillHead(value); counts.skill++;
    }
    if (updated !== undefined) edits.push({start: match.index, end: match.index + match[0].length, old: match[0], replacement: JSON.stringify(updated)});
  }
  if (counts.skill === 0) {
    const anchor = 'function handleSkill(request) {\n  const body = `';
    assert.equal(before.split(anchor).length, 2, 'Expected one skill template');
    const start = before.indexOf(anchor) + anchor.length;
    const frontmatter = before.slice(start).match(/^---\n[\s\S]*?\n---\n(?:\n)?/);
    assert(frontmatter);
    const offset = start + frontmatter[0].length;
    assert(!/[`\\]|\$\{/.test(passage), 'Passage must be safe as exact template bytes');
    edits.push({start: offset, end: offset, old: '', replacement: passage + '\n\n'});
    counts.skill++;
  }
  if (publishedSkill !== undefined) {
    const oldDigest = 'sha256:' + sha(publishedSkill);
    const newDigest = 'sha256:' + sha(placeAtSkillHead(publishedSkill));
    const matches = [...before.matchAll(new RegExp(oldDigest, 'g'))];
    assert.equal(matches.length, 1, 'Canonical skill discovery digest must match the current served skill exactly once');
    const offset = matches[0].index;
    assert(!edits.some(edit => offset >= edit.start && offset < edit.end), 'Do not rewrite an archived digest');
    edits.push({start: offset, end: offset + oldDigest.length, old: oldDigest, replacement: newDigest});
    counts.catalogDigest++;
  }
  assert.equal(counts.forAgents, 1);
  assert.equal(counts.skill, 1);
  if (requireAll) {
    assert.equal(counts.homepage, 1, 'Retrieve the active presentation Worker; repository snapshot is insufficient');
    assert.equal(counts.plain, 1);
    assert.equal(counts.catalogDigest, 1, 'Supply the current served SKILL.md to preserve its discovery digest');
  }
  edits.sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) assert(edits[i - 1].end <= edits[i].start);
  let after = before;
  for (const edit of [...edits].reverse()) after = after.slice(0, edit.start) + edit.replacement + after.slice(edit.end);
  let restored = after;
  let delta = 0;
  for (const edit of edits) {
    const offset = edit.start + delta;
    assert.equal(after.slice(offset, offset + edit.replacement.length), edit.replacement);
    edit.afterStart = offset;
    delta += edit.replacement.length - edit.old.length;
  }
  for (const edit of [...edits].reverse()) restored = restored.slice(0, edit.afterStart) + edit.old + restored.slice(edit.afterStart + edit.replacement.length);
  assert.equal(restored, before, 'Every byte outside the scoped edits must remain exact');
  return {source: after, counts};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [activePath, candidatePath, publishedSkillPath] = process.argv.slice(2);
  assert(activePath && candidatePath && publishedSkillPath, 'Usage: node after-the-mirror.mjs ACTIVE.js CANDIDATE.js SERVED-SKILL.md');
  assert.notEqual(path.resolve(activePath), path.resolve(candidatePath), 'Keep the authenticated active snapshot untouched');
  const before = fs.readFileSync(activePath, 'utf8');
  const {source, counts} = patchWorkerSnapshot(before, {publishedSkill: fs.readFileSync(publishedSkillPath, 'utf8')});
  fs.writeFileSync(candidatePath, source);
  console.log(JSON.stringify({counts, before: {bytes: Buffer.byteLength(before), sha256: sha(before)}, after: {bytes: Buffer.byteLength(source), sha256: sha(source)}}));
}
