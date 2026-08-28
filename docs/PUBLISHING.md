# Publication runbook

The local repository is complete and committed on branch `main`. Its intended
public destination is:

```text
https://github.com/violetclaire/popcorn-temporal-anchor
```

## GitHub

Run these commands from the repository directory after authenticating the
`violetclaire` account:

```powershell
gh auth login -h github.com -w
gh repo create popcorn-temporal-anchor --public --source . --remote origin --push --description "Portable, signed x402 temporal evidence for autonomous agents"
gh repo edit violetclaire/popcorn-temporal-anchor --homepage "https://767-2676.com/agents" --add-topic x402 --add-topic ai-agents --add-topic agentic-commerce --add-topic base --add-topic usdc --add-topic temporal-evidence --add-topic openclaw-skill
```

Do not paste the `PS C:\...>` prompt. Enter only the commands.

The repository intentionally has no reuse license until the owner selects one.
For broad open-source adoption, obtain legal advice or explicitly choose a
license such as Apache-2.0 before inviting code reuse.

## GitHub success signals

Stars are awareness, not adoption. The strongest signals are ordered below:

1. independent paid calls to `/v1/time`;
2. verified receipts reproduced by third-party clients;
3. downstream integrations and dependency references;
4. forks that add a real framework adapter;
5. issues reporting successful interoperability;
6. unique cloners and referring sites;
7. stars and social mentions.

Use GitHub traffic analytics to separate page views from repository clones.
Never publish wallet addresses, private keys, or payment signatures as proof.

## ClawHub

After the GitHub repository is public and the owner is authenticated with
ClawHub:

```bash
npm install --global clawhub
clawhub login
clawhub skill publish ./openclaw/popcorn-temporal-anchor --version 1.0.3
```

Publishing is a public representational action. Review the final ClawHub owner,
slug, version, and file list before confirming it.

## Official x402 ecosystem

After the public GitHub URL works:

1. Fork `x402-foundation/x402`.
2. Add `typescript/site/app/ecosystem/partners-data/popcorn-temporal-anchor/metadata.json`
   using the metadata in [`VENUES.md`](VENUES.md).
3. Add `assets/popcorn-logo.png` to the ecosystem site's `public/logos/` folder
   as `popcorn-temporal-anchor.png`.
4. Open a focused pull request under the `Services/Endpoints` category.
5. Include the live `402` resource, public API documentation, and an independently
   reproduced mainnet payment/receipt-verification result.

Do not open the ecosystem pull request before the integration repository is
public; the x402 review criteria expect working documentation and maintenance.
