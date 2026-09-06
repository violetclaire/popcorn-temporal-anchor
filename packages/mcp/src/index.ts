#!/usr/bin/env node

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--sample") {
  // Sample evaluation needs only Node and the bundled verifier/receipts.
  const { popcornSample } = await import("./sample.js");
  process.stdout.write(`${JSON.stringify(await popcornSample(), null, 2)}\n`);
} else if (args.length > 0) {
  process.stderr.write("Usage: popcorn-mcp [--sample]\n");
  process.exitCode = 1;
} else {
  const [{ serveStdio }, { createServer }] = await Promise.all([
    import("@modelcontextprotocol/server/stdio"),
    import("./server.js"),
  ]);
  await serveStdio(createServer);
}
