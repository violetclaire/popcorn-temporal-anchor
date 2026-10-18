import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationNeeded } from './check-registry.mjs';
const manifest = { name: 'io.github.example/server', version: '1.2.3', description: 'test', packages: [{version:'1.2.3'}] };
const record = (server=manifest,status='active') => ({server,_meta:{'io.modelcontextprotocol.registry/official':{status}}});
const reply = (status, body) => async () => ({status,json:async()=>body});
test('absent version needs publishing with an encoded exact version URL', async()=> {
 assert.equal(await publicationNeeded(manifest,async url=>{assert.equal(url,'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.example%2Fserver/versions/1.2.3');return {status:404};}),true);
});
test('identical active version is already complete',async()=>assert.equal(await publicationNeeded(manifest,reply(200,record())),false));
test('metadata mismatch is not suppressed as duplicate success',async()=>assert.rejects(publicationNeeded(manifest,reply(200,record({...manifest,description:'different'})))));
test('inactive versions and missing status fail',async()=>{for(const status of ['deleted','deprecated',undefined])await assert.rejects(publicationNeeded(manifest,reply(200,{server:manifest,_meta:{'io.modelcontextprotocol.registry/official':{status}}})));});
test('authentication, throttling and server failures remain failures',async()=>{for(const status of [401,403,429,500])await assert.rejects(publicationNeeded(manifest,reply(status,{})));});
test('network and invalid JSON fail',async()=>{await assert.rejects(publicationNeeded(manifest,async()=>{throw Error('network');}));await assert.rejects(publicationNeeded(manifest,async()=>({status:200,json:async()=>{throw Error('json');}})));});
