#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspect as inspectValue } from 'node:util';
import { createAgent, MAX_REQUEST_BYTES } from '../src/agent.mjs';

// Config and adapter logging belongs on stderr, including during module import.
for (const method of ['log', 'info', 'debug', 'warn', 'error']) {
  console[method] = (...values) => process.stderr.write(`${values.map(value => typeof value === 'string' ? value : inspectValue(value)).join(' ')}\n`);
}

const errorReply = (code, message) => ({ id: null, error: { code, message } });

async function writeReply(reply) {
  let line;
  try { line = JSON.stringify(reply); }
  catch { line = JSON.stringify({ id: reply.id, error: { code: 'INVALID_RESULT', message: 'The configured operation returned a non-JSON result.' } }); }
  await new Promise((resolveWrite, rejectWrite) => {
    process.stdout.write(`${line}\n`, error => error ? rejectWrite(error) : resolveWrite());
  });
}

/** Keep at most one bounded line; discard an oversized line until its next newline. */
async function* lines(input) {
  let parts = [];
  let size = 0;
  let oversized = false;
  for await (const chunk of input) {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline;
      const length = end - offset;
      if (!oversized) {
        if (size + length > MAX_REQUEST_BYTES) {
          oversized = true;
          parts = [];
          size = 0;
        } else if (length) {
          // Copy to avoid retaining a large input chunk through a tiny slice.
          parts.push(Buffer.from(chunk.subarray(offset, end)));
          size += length;
        }
      }
      if (newline < 0) break;
      yield oversized ? null : Buffer.concat(parts, size);
      parts = [];
      size = 0;
      oversized = false;
      offset = newline + 1;
    }
  }
  if (oversized || size) yield oversized ? null : Buffer.concat(parts, size);
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node bin/agent.mjs <trusted-local-config.mjs>');
  const configPath = resolve(process.argv[2]);
  const module = await import(pathToFileURL(configPath).href);
  if (typeof module.default !== 'function') throw new Error('Config must default-export an async configuration function.');
  const agent = createAgent(await module.default());
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const line of lines(process.stdin)) {
    if (line === null) {
      await writeReply(errorReply('REQUEST_TOO_LARGE', 'Request exceeds the 65536-byte limit.'));
      continue;
    }
    let request;
    try { request = JSON.parse(decoder.decode(line)); }
    catch {
      await writeReply(errorReply('PARSE_ERROR', 'Each input line must contain one valid UTF-8 JSON request.'));
      continue;
    }
    await writeReply(await agent.handle(request));
  }
}

main().catch(error => {
  console.error(`Agent driver failed: ${error.message}`);
  process.exitCode = 1;
});
