import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { handleAgentEntry } from "../generated/agent-entry.mjs";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const request = (path, method = "GET") => new Request(`https://767-2676.com${path}`, { method });

test("operational routes, clock, keys, and non-document methods stay with the original Worker", () => {
  for (const path of ["/", "/time", "/v1/time", "/v1/receipt", "/agent/offer", "/.well-known/popcorn-keys.json", "/agent/status", "/missing"]) {
    for (const method of ["GET", "POST", "HEAD", "OPTIONS"]) assert.equal(handleAgentEntry(request(path, method)), null);
  }
  assert.equal(handleAgentEntry(request("/SKILL.md", "POST")), null);
});

test("free routes serve exact source bytes with correct HEAD and cross-origin behavior", async () => {
  for (const [path, source] of [["/demo", "site/demo/index.html"], ["/demo/", "site/demo/index.html"], ["/agents", "site/agents/index.html"], ["/SKILL.md", "skills/popcorn-temporal-anchor/SKILL.md"], ["/demo/demo.js", "site/demo/demo.js"]]) {
    const get = handleAgentEntry(request(path));
    assert.equal(get.status, 200);
    assert.equal(await get.text(), await read(source));
    const head = handleAgentEntry(request(path, "HEAD"));
    assert.equal(await head.text(), "");
    assert.equal(head.headers.get("content-type"), get.headers.get("content-type"));
    assert.equal(head.headers.get("access-control-allow-origin"), "*");
    assert.equal(handleAgentEntry(request(path, "OPTIONS")).status, 204);
  }
  const csp = handleAgentEntry(request("/demo")).headers.get("content-security-policy");
  assert.ok(csp.includes("connect-src 'self'"));
  assert.ok(csp.includes("script-src 'self'"));
});

test("embedded evidence is byte-identical and skill copies stay synchronized", async () => {
  for (const file of ["evaluation-packet.production.json", "evaluation-packet.proceed-002.production.json", "evaluation-outcomes.json"]) {
    assert.equal(await handleAgentEntry(request(`/samples/${file}`)).text(), await read(`examples/witness/${file}`));
  }
  assert.equal(await read("skills/popcorn-temporal-anchor/SKILL.md"), await read("openclaw/popcorn-temporal-anchor/SKILL.md"));
  const sitemap = await handleAgentEntry(request("/sitemap.xml")).text();
  assert.ok(sitemap.includes("<loc>https://767-2676.com/demo</loc>"));
});

function element() {
  const children = {};
  return { dataset: {}, textContent: "", disabled: true, addEventListener() {},
    querySelector(selector) { return children[selector] ??= element(); } };
}

async function demoContext(transform = value => value) {
  const fields = Object.fromEntries(["byte-length", "signature", "overlap", "original-byte", "tampered-byte", "load-status", "tamper-result"].map(name => [name, element()]));
  for (const [name, field] of Object.entries(fields)) field.dataset.field = name;
  const buttons = { '[data-action="flip"]': element(), '[data-action="reset"]': element() };
  const called = [];
  const context = createContext({
    document: { querySelectorAll: () => Object.values(fields), querySelector: selector => buttons[selector] },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, atob, btoa,
    fetch: async path => {
      called.push(path);
      assert.ok(path.startsWith("/samples/"), "demo may only fetch free same-origin samples");
      const response = handleAgentEntry(request(path));
      assert.ok(response, "sample must be included in deployment");
      return Response.json(transform(await response.json(), path));
    },
  });
  runInContext(await read("site/demo/demo.js"), context);
  return { context, fields, buttons, called };
}

test("browser demo verifies the real STOP packet and rejects one-byte tampering without payment", async () => {
  const { context, fields, buttons, called } = await demoContext();
  await runInContext("loadPublicSample()", context);
  assert.equal(fields.signature.textContent, "valid");
  assert.equal(fields.overlap.textContent, "false");
  assert.equal(buttons['[data-action="flip"]'].disabled, false);
  await runInContext("flipPublishedByte()", context);
  assert.equal(fields["tamper-result"].dataset.state, "failed-as-expected");
  assert.equal(fields["tamper-result"].querySelector("strong").textContent, "witness_payload_digest_does_not_match_expected");
  assert.ok(called.every(path => path.startsWith("/samples/")));
});

test("demo refuses a nonce that disagrees with the signed commitment", async () => {
  const { context, buttons } = await demoContext((packet, path) => {
    if (path.endsWith("evaluation-packet.production.json")) packet.submitted_request.nonce = "wrong-nonce";
    return packet;
  });
  await assert.rejects(runInContext("loadPublicSample()", context), /STOP checks/);
  assert.equal(buttons['[data-action="flip"]'].disabled, true);
});
