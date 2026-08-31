import type { JsonWebKeySet } from "../../../verify/typescript/src/index.js";
import {
  DEFAULT_JWKS_URL,
  DEFAULT_SERVICE_URL,
  readExactBytes,
  verifyPortableOutcome,
} from "./carrier.js";

function argumentValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outcomeLocation = argumentValue(argv, "--outcome");
  if (!outcomeLocation) throw new Error("provide --outcome FILE_OR_HTTPS_URL");
  const allowed = new Set(["--outcome", "--jwks", "--jwks-file"]);
  for (let index = 0; index < argv.length; index += 2) {
    if (!allowed.has(argv[index])) {
      throw new Error(`unsupported argument: ${argv[index]}`);
    }
  }
  const jwksUrl = argumentValue(argv, "--jwks") ?? DEFAULT_JWKS_URL;
  const jwksFile = argumentValue(argv, "--jwks-file");
  if (jwksFile && argv.includes("--jwks")) {
    throw new Error("provide at most one --jwks HTTPS_URL or --jwks-file FILE");
  }
  const outcome = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readExactBytes(outcomeLocation),
    ),
  );
  const jwks = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readExactBytes(jwksFile ?? jwksUrl),
    ),
  ) as JsonWebKeySet;
  const verified = await verifyPortableOutcome(outcome, jwks, {
    expectedServiceUrl: DEFAULT_SERVICE_URL,
    expectedKeySetUrl: jwksUrl,
  });
  console.log(JSON.stringify(verified, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
