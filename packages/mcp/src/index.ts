#!/usr/bin/env node

const args = process.argv.slice(2);
if (args.length === 2 && args[0] === "verify-v2") {
  const [{ readFile }, { verifyV2 }] = await Promise.all([
    import("node:fs/promises"),
    import("./v2-interface.js"),
  ]);
  try {
    const document = JSON.parse(await readFile(args[1], "utf8"));
    const outcome = await verifyV2(document.input ?? document);
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
    if (!outcome.accepted) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Unable to read vector"}\n`);
    process.exitCode = 1;
  }
} else if (args.length === 1 && args[0] === "--sample") {
  // Sample evaluation needs only Node and the bundled verifier/receipts.
  const { popcornSample } = await import("./sample.js");
  process.stdout.write(`${JSON.stringify(await popcornSample(), null, 2)}\n`);
} else if (args.length > 0) {
  process.stderr.write("Usage: popcorn-mcp [--sample | verify-v2 <vector.json>]\n");
  process.exitCode = 1;
} else {
  const [{ serveStdio }, { createServer }] = await Promise.all([
    import("@modelcontextprotocol/server/stdio"),
    import("./server.js"),
  ]);
  await serveStdio(createServer);
}
