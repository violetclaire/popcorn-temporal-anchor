import test from 'node:test';
import assert from 'node:assert/strict';
import { handleServiceDocument } from './service-pages.mjs';

test('public documents support GET, HEAD, query strings and trailing slashes', async () => {
  for (const path of ['/pricing', '/pricing/', '/terms', '/terms/']) {
    const get = handleServiceDocument(new Request(`https://767-2676.com${path}?ref=directory`));
    const head = handleServiceDocument(new Request(`https://767-2676.com${path}`, { method: 'HEAD' }));
    assert.equal(get.status, 200);
    assert.equal(head.status, 200);
    assert.deepEqual([...head.headers], [...get.headers]);
    assert.equal(await head.text(), '');
    const html = await get.text();
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<h1>/);
    assert.match(html, /href="\/pricing"/);
    assert.match(html, /href="\/terms"/);
    assert.match(html, /href="\/llms.txt"/);
    assert.doesNotMatch(html, /<script\b/i);
  }
});

test('all unrelated paths and methods fall through to the existing Worker', () => {
  for (const path of ['/', '/time', '/time?format=json', '/v1/time', '/v1/receipt', '/agent/handoff', '/agents', '/llms.txt', '/robots.txt', '/.well-known/popcorn-keys.json', '/pricing-other', '/terms/anything']) {
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
      assert.equal(handleServiceDocument(new Request(`https://767-2676.com${path}`, { method })), null);
    }
  }
  for (const path of ['/pricing', '/terms']) {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      assert.equal(handleServiceDocument(new Request(`https://767-2676.com${path}`, { method })), null);
    }
  }
});
