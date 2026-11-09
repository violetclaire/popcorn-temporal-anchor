# Bundled third-party inventory — bundles held from publication

This is an inventory of the complete retained deployment exports, not a license grant or a choice of terms for the new deployment folders. No LICENSE, NOTICE, terms or existing licensing file was created, edited or replaced. The exported code and its existing notices remain byte-identical.

## Publication scope approved by the owner

The owner approved publishing the public verification keys, certificates and already-public service-binding URL, but directed that every module bundling third-party packages be held. This change includes 13 modules with no identified bundled third-party packages, four unchanged manifests, the two inventory reports, and `.gitattributes`: 20 added files. The three modules below remain local and are not included in this commit or PR.

| Held module, relative to the repository root | Bundled third-party code |
| --- | --- |
| `deployed/seven-six-seven-2676/156b5753-df22-4712-bde5-085a6ed144fc/tain-qr.mjs` | Vendored `@juit/qrcode` 1.0.112 |
| `deployed/popcorn-tain-verify-mcp-v2/bfd59d6f-fd3e-4493-974d-ad073e7742ad/worker.js` | MCP SDK 2.0.0, Zod, and nested SDK dependencies identified below |
| `deployed/popcorn-canonical-mcp/0676c12a-fe17-470c-8490-f92efc3095b5/full-worker.js` | MCP SDK 2.3.1, Zod, x402, and nested dependencies identified below |

The four manifests intentionally retain the complete deployed inventories and hashes, including the held filenames. They are evidence of the captured versions, not a claim that all listed files are included in this PR. This partial archive is not a complete deployable checkout: the main Worker imports the held QR module, and the two remote MCP directories contain only their manifests. The inventory below covers held exports too; it does not mean those packages are newly published by this change. No license/notice files have been selected or added to clear the held bundles. Parts 2 and 3 remain pending.

| Package/code component | Identified version | License evidence | Included in |
| --- | --- | --- | --- |
| `@modelcontextprotocol/server` | 2.0.0 | MIT in the matching cached package manifest and LICENSE | Dedicated verifier |
| `@modelcontextprotocol/core` | 2.0.0 | MIT in the matching cached package manifest and LICENSE | Dedicated verifier |
| `@modelcontextprotocol/server` | 2.3.1 | Apache-2.0 in package manifest and LICENSE | Canonical MCP |
| `@modelcontextprotocol/core` | 2.3.1 | Apache-2.0 in package manifest and LICENSE | Canonical MCP |
| `@modelcontextprotocol/core-internal` monorepo source | Exact standalone package revision not pinned by the exported bundle | Included in the enclosing SDK distributions above; no standalone package/license provenance independently established | Both remote bundles; SDK source maps identify `../../core-internal/src/…` |
| `zod` | 4.5.4 (v4 implementation) | MIT in package manifest and LICENSE | Both remote bundles |
| `zod` | 3.25.76 (nested v3 implementation) | MIT in nested package manifest and LICENSE | Canonical MCP through `@x402/core` |
| `@x402/core` | 2.24.0 | Apache-2.0 in package manifest/locked metadata | Canonical MCP |
| `@x402/evm` | 2.24.0 | Apache-2.0 in package manifest/locked metadata | Canonical MCP |
| `@cfworker/json-schema` | 4.1.1 | MIT in the exact-version publisher metadata; SDK source-map paths pin 4.1.1 | Both remote bundles, inside SDK validator distribution |
| `content-type` | 1.0.5 | MIT in the exact-version publisher metadata and preserved bundled license notice; SDK source-map paths pin 1.0.5 | Both remote bundles, inside SDK server distribution |
| `@juit/qrcode` | 1.0.112 | Apache-2.0 in the vendored module header, original local vendor LICENSE/NOTICE, and exact-version publisher metadata | Main Worker `tain-qr.mjs` |

No third-party package import, package-source marker or third-party copyright notice was identified in the standalone Briarwood module. The other main Worker support modules contain application code and retained public documents/evidence; their lack of package markers is not proof against unattributed copied code.

## Evidence and identification method

All 16 retained deployed modules were inventoried; 13 are included and three are held as listed above. The two held remote bundles retain 70 node_modules source-section occurrences in total. All 70 were resolved to existing cached package distribution files. Their available distribution source maps additionally identify nested `content-type`, `@cfworker/json-schema`, and SDK `core-internal` source. The bundles preserve a content-type MIT copyright notice at their tails. Package manifests and existing LICENSE files were read in place; they were not copied or modified.

The dedicated SDK's distinctive `auth-CUe6YdwF.mjs`, `src-CX2iR2pK.mjs`, and `mcp-DXXb3Vv3.mjs` files occur in the retained 2.0.0 distribution. The canonical counterparts `auth-BNDyLTqp.mjs`, `src-Cqbh3MYc.mjs`, and `mcp-DIH4cS6P.mjs` occur in the retained 2.3.1 distribution. Shared filenames alone were not used to silently equate the SDK versions.

Primary published metadata checked for nested/vendor packages: [@cfworker/json-schema 4.1.1](https://registry.npmjs.org/%40cfworker%2Fjson-schema/4.1.1), [content-type 1.0.5](https://registry.npmjs.org/content-type/1.0.5), [@juit/qrcode 1.0.112](https://registry.npmjs.org/%40juit%2Fqrcode/1.0.112). No package was installed or published for this inventory.

## Items explicitly flagged for the owner before merge

- The held exports contain third-party code under several licenses; the two MCP Worker distributions do not share a single SDK license/version. This report does not assign the repository's owner-authored terms to third-party code. Their future publication remains separate from this PR.
- The held `tain-qr.mjs` says “see LICENSE.md and NOTICE.md,” but those sibling files are not present in the exported 13-module Worker. The original local vendor folder contains them. Neither the module nor those notice files is added by this PR; the brief prohibits creating or selecting license/terms files.
- Cached `@x402/core` and `@x402/evm` package roots identify Apache-2.0 in their manifests but contain no root LICENSE/NOTICE file in the inspected installations. No notice file was invented.
- The exact independently versioned `core-internal` package and its standalone licensing evidence are unresolved; only its inclusion as source inside the identified SDK distributions is established.
- Original signed build provenance, original remote source maps, and a guarantee that no unattributed code exists are not available. The inventory is exhaustive for the package markers, package maps and explicit vendor notices inspected, not a claim of legal clearance.
