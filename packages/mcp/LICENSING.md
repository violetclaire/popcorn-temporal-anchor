# POPCORN licensing boundaries

Effective for this notice: September 15, 2026.

This notice governs this repository only; other Briarwood projects carry their own terms.

## Rule

Producer means code that holds or uses the issuer's signing keys, or issues or
settles receipts or payments. Everything else that callers run or read is
Checker, MIT. Branding is excluded from both.

## Directory map

Paths below are relative to the repository root. Each MIT directory has a
standard LICENSE file. The issuer's LICENSE.md contains the Evaluation License.

| Top-level directory | License and scope |
| --- | --- |
| `.github` | MIT: repository workflows and templates. |
| `assets` | Excluded: names, logos and branding. |
| `docs` | MIT: documentation and instructions; receipt-use terms remain unchanged. |
| `examples` | MIT: all examples, clients, checks and saved example files. |
| `integrations` | MIT: Hugging Face and SOS-BOTS callers, static serving and worksheet code. |
| `openclaw` | MIT: instructions; this directory contains no executable code. |
| `packages` | MIT: MCP client/checker package and supporting files. |
| `reference` | MIT for deployment documentation; `reference/issuer/typescript` is POPCORN Evaluation License. |
| `schemas` | MIT: protocol schemas. |
| `site` | MIT: pages, caller examples, metadata and static-page deployment tooling; branding excluded. |
| `skills` | MIT: instructions. |
| `verify` | MIT: TypeScript and Python verifiers and test vectors. |

Explicit Checker LICENSE files are present in `verify/typescript`, `packages/mcp`, `integrations/huggingface-space`, `examples/verification-checks`, `examples/typescript-x402-client`, `examples/typescript-x402-witness-client`, `integrations/sosbots-board`, `verify/test-vectors`, `schemas`, `docs`, `skills`, `openclaw`, `examples/task-schedule`.
Other children inherit their parent directory's license unless the map states
an exception.

Root documentation and `service-catalog.json` are MIT under `docs/LICENSE`;
root repository configuration files are MIT under `.github/LICENSE`.
The root [LICENSE.md](https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/LICENSE.md)
retains the Evaluation License for the issuer scope named in its section 1.

Names, logos, and branding in `assets` are not licensed for reuse.

The SOS-BOTS Worker serves static files, rejects writes, holds no issuer signing
keys and issues or settles no receipts or payments. Its whole directory is MIT.
The test-vector generator creates synthetic keys in memory; it contains no
issuer private key material. Public verification keys and signed fixtures are
not private signing keys.

## Existing grants are different from future terms

The npm releases `@violetclaire/popcorn-mcp` 0.1.0, 0.1.1 and 0.1.2 declared MIT.
They include compiled MCP and POPCORN verifier code; 0.1.2 also includes the
sample and task-schedule code. The Hugging Face integration also declared MIT.
This notice does not revoke or narrow rights previously granted, remove required
notices, or establish the legal reach of those grants. Changing repository
metadata does not change existing npm tarballs. Prior grants and patent scope
require separate review. Third-party dependencies retain their own licenses.

## Receipts

The files in `examples/task-schedule` are MIT. The signed receipts inside are
also covered by `docs/RECEIPT_USE.md`.

[Receipt carry-and-use permission](https://github.com/violetclaire/popcorn-temporal-anchor/blob/main/docs/RECEIPT_USE.md)
allows recipients to use and pass issued receipts in their workflows. It does
not license issuer software, grant task authority, or turn a historical
checkpoint into current time.

## Distribution status

Repository notices govern only within their applicable scope. The npm registry,
Hugging Face Space and hosted website are separately deployed surfaces; a source
commit alone does not update them. See the package's actual release terms.
