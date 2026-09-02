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
gh repo create popcorn-temporal-anchor --public --source . --remote origin --push --description "Verify a settled time checkpoint and one-byte digest break before paying for fresh evidence"
gh repo edit violetclaire/popcorn-temporal-anchor --homepage "https://767-2676.com/demo" --add-topic x402 --add-topic agent-skills --add-topic openclaw-skill --add-topic temporal-evidence --add-topic cryptographic-verification --add-topic offline-first --add-topic signed-receipts
```

Do not paste the `PS C:\...>` prompt. Enter only the commands.

The repository intentionally has no reuse license until the owner selects one.
For broad open-source adoption, obtain legal advice or explicitly choose a
license such as Apache-2.0 before inviting code reuse.

## GitHub success signals

Stars are awareness, not adoption. The strongest signals are ordered below:

1. independent reproductions of the settled packet and one-byte failure;
2. installs of the public `SKILL.md` package;
3. verified receipts reproduced by third-party clients;
4. downstream integrations and dependency references;
5. forks that add a real framework adapter;
6. issues reporting successful interoperability;
7. unique cloners, referring sites, stars, and social mentions.

Use GitHub traffic analytics to separate page views from repository clones.
Never publish wallet addresses, private keys, or payment signatures as proof.

## ClawHub

After the GitHub repository is public and the owner is authenticated with
ClawHub:

```bash
npx clawhub@latest whoami
npx clawhub@latest skill publish ./openclaw/popcorn-temporal-anchor --dry-run
npx clawhub@latest skill publish ./openclaw/popcorn-temporal-anchor
```

Publishing is a public representational action. Review the final ClawHub owner,
slug, version, and file list before confirming it.

## Agent-skill install surfaces

The standard package path makes the skill directly discoverable and installable
from GitHub:

```bash
npx skills add violetclaire/popcorn-temporal-anchor --skill popcorn-temporal-anchor
gh skill install violetclaire/popcorn-temporal-anchor skills/popcorn-temporal-anchor/SKILL.md --agent codex --scope user
```

Every listing must lead with the free sample and include both machine inputs:

- `https://767-2676.com/SKILL.md`
- `https://raw.githubusercontent.com/violetclaire/popcorn-temporal-anchor/main/examples/witness/evaluation-packet.production.json`

Do not pay to register a directory listing as part of routine publication.
Prefer installable GitHub catalogs that accept a normal pull request and keep
the paid endpoint as an optional last step.

## Official x402 ecosystem

After the public GitHub URL works:

1. Fork `x402-foundation/x402`.
2. Add `typescript/site/app/ecosystem/partners-data/popcorn-temporal-anchor/metadata.json`
   using the metadata in [`VENUES.md`](VENUES.md).
3. Add `assets/popcorn-logo.png` to the ecosystem site's `public/logos/` folder
   as `popcorn-temporal-anchor.png`.
4. Open a focused pull request under the `Services/Endpoints` category.
5. Lead with `/demo`, `SKILL.md`, the raw settled packet, and its offline
   verification command. Mention the paid live resource last.

Do not open the ecosystem pull request before the integration repository is
public; the x402 review criteria expect working documentation and maintenance.
