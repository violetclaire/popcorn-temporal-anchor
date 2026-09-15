import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTaskRevision, digest } from './revision-gate.mjs';
const bytes = value => Buffer.from(JSON.stringify(value));
// Synthetic task data. Amounts in cents; the original total is unspecified.
const original = bytes({need:'Provide hair service',participants:['artist'],deposit:80000,total:null});
const expanded = bytes({need:'Provide hair and makeup services',participants:['artist','helper'],deposit:80000,total:550000});
const checks = {authority:true,conditions:true,time:true};
const approve = b => ({decision:'approved',exactTaskDigest:digest(b)});
const request = (b=original) => ({acceptedBytes:original,proposedBytes:b,predecessorTaskDigest:digest(original),approval:approve(original),checks});
test('unchanged authorized work proceeds',()=>assert.equal(checkTaskRevision(request()).action,'PROCEED'));
test('expanded work cannot inherit the original YES',()=>assert.equal(checkTaskRevision(request(expanded)).action,'COUNTER'));
test('fresh approval for the exact revision permits that revision',()=>assert.equal(checkTaskRevision({...request(expanded),approval:approve(expanded)}).action,'PROCEED'));
test('revision must identify its actual predecessor',()=>assert.equal(checkTaskRevision({...request(expanded),predecessorTaskDigest:'wrong',approval:approve(expanded)}).action,'STOP'));
for(const key of ['authority','conditions','time']) for(const value of [false,null,'true']) {
 test(`${key}=${value} cannot pass`,()=>assert.equal(checkTaskRevision({...request(),checks:{...checks,[key]:value}}).action,'STOP'));
}
test('new approval cannot revive an expired task',()=>assert.equal(checkTaskRevision({...request(expanded),approval:approve(expanded),checks:{...checks,time:false}}).action,'STOP'));
test('failure retains original bytes, deposit and approval',()=>{
 const req=request(expanded), before=structuredClone(req); checkTaskRevision(req);
 assert.deepEqual([...req.acceptedBytes],[...before.acceptedBytes]); assert.deepEqual([...req.proposedBytes],[...before.proposedBytes]);
 assert.deepEqual(req.approval,before.approval);assert.equal(JSON.parse(req.proposedBytes.toString()).deposit,80000);
});
test('receiver rechecks: a changed proposal after actor acceptance never commits',()=>{
 const req=request();assert.equal(checkTaskRevision(req).action,'PROCEED');
 const delivered={...req,proposedBytes:expanded};let committed=0;
 // Synchronous local fixture only. A real executor needs its own protected commit.
 if(checkTaskRevision(delivered).action==='PROCEED') committed++;
 assert.equal(committed,0);
});
test('missing approval cannot become permission merely because checks are populated',()=>assert.equal(checkTaskRevision({...request(),approval:null}).action,'COUNTER'));
test('malformed bytes stop',()=>assert.equal(checkTaskRevision({...request(),proposedBytes:''}).action,'STOP'));
