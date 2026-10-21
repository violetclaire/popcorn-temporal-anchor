import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const mirrorSha256='91f270e961afbf4f530ac62b782d5285f63af415819accf99e6b09505687a93e';
export const mirrorElementSha256='9aac35f480e3631a484500f2c2e0221b966a71b95f540e62f00e7270c210feef';
const definition='leTAIN: one work, in one set of bytes, that shows a human one thing and an agent another, each seeing recoverable and checkable against the other, so that sight itself can be witnessed.';
const anchor=Buffer.from('<p class="definition">'+definition+'</p>');
const prolog=Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export function mirrorBytes(source) {
  source=Buffer.from(source);
  assert.equal(source.length,67523,'Exact mirror source size required');
  assert.equal(sha(source),mirrorSha256,'Exact mirror source hash required');
  assert(source.subarray(0,prolog.length).equals(prolog),'Exact XML prolog line required');
  const insertion=source.subarray(prolog.length);
  assert.equal(insertion.length,67484);
  assert.equal(insertion.subarray(-7).toString(),'</svg>\n');
  const element=insertion.subarray(0,-1);
  assert.equal(element.length,67483);
  assert.equal(sha(element),mirrorElementSha256);
  assert(!/<(?:a|script|foreignObject|iframe|image)\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(insertion.toString()),'Mirror must contain no links, scripts, event handlers, or external resources');
  return {insertion,element,prolog};
}

export function insertMirror(previous,source) {
  previous=Buffer.from(previous);
  const {insertion}=mirrorBytes(source);
  const index=previous.indexOf(anchor);
  assert(index>=0,'Exact ratified leTAIN definition required');
  assert.equal(previous.indexOf(anchor,index+1),-1,'Definition placement must be unique');
  assert(!/<svg(?:\s|>)/i.test(previous.toString()),'Before document must not already contain the mirror');
  const offset=index+anchor.length;
  return Buffer.concat([previous.subarray(0,offset),insertion,previous.subarray(offset)]);
}

export function verifyMirrorInsertion(previous,candidate,source) {
  previous=Buffer.from(previous);candidate=Buffer.from(candidate);
  const {insertion,element,prolog}=mirrorBytes(source);
  const expected=insertMirror(previous,source);
  assert.deepEqual(candidate,expected,'Only the exact mirror bytes may be inserted after the ratified definition');
  const offset=candidate.indexOf(insertion);
  assert(offset>=0);assert.equal(candidate.indexOf(insertion,offset+1),-1);
  const reconstructed=Buffer.concat([candidate.subarray(0,offset),candidate.subarray(offset+insertion.length)]);
  assert.deepEqual(reconstructed,previous,'Removing the mirror must reconstruct every preexisting homepage byte');
  assert.equal((candidate.toString().match(/<svg(?:\s|>)/gi)||[]).length,1);
  assert.equal((candidate.toString().match(/<img(?:\s|>)/gi)||[]).length,0);
  assert(!candidate.includes(prolog),'XML prolog must not be inserted in HTML');
  return {reconstructed,insertion,element,offset,proof:{source_bytes:source.length,source_sha256:sha(source),prolog_removed_bytes:prolog.length,inserted_bytes:insertion.length,inserted_sha256:sha(insertion),source_element_bytes:element.length,source_element_sha256:sha(element),candidate_element_sha256:sha(candidate.subarray(offset,offset+element.length)),before_bytes:previous.length,before_sha256:sha(previous),after_bytes:candidate.length,after_sha256:sha(candidate),insertion_byte_offset:offset,removal_reconstructs_before_exactly:true,all_existing_page_bytes_unchanged:true}};
}
