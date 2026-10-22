import assert from "node:assert/strict";
import { popcornSample } from "@violetclaire/popcorn-mcp/sample";

import {
  popcornHash,
  popcornVerifyWitnessChain,
  popcornWitness,
} from "@violetclaire/popcorn-mcp/core";

assert.equal(typeof popcornHash, "function");
assert.equal(typeof popcornVerifyWitnessChain, "function");
assert.equal(typeof popcornWitness, "function");
assert.equal((await popcornSample()).v2.accepted, true);
process.stderr.write("package core export smoke test passed\n");
