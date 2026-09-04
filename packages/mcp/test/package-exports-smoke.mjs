import assert from "node:assert/strict";

import {
  popcornHash,
  popcornVerifyWitnessChain,
  popcornWitness,
} from "@violetclaire/popcorn-mcp/core";

assert.equal(typeof popcornHash, "function");
assert.equal(typeof popcornVerifyWitnessChain, "function");
assert.equal(typeof popcornWitness, "function");
process.stderr.write("package core export smoke test passed\n");
