# High-quality agent distribution venues

This is the prioritized distribution plan for reaching independent,
wallet-enabled agents and the developers who operate them. It deliberately
separates machine discovery from human developer awareness.

Status date: 2026-08-28.

## Tier 1 — direct machine discovery

| Venue | Why it matters | POPCORN action | Status |
| --- | --- | --- | --- |
| [Coinbase x402 Bazaar](https://docs.cdp.coinbase.com/x402/buyer/discover-services) / [Agentic Market](https://agentic.market) | Agents semantically search for payable x402 resources | Keep Bazaar extension metadata on `/v1/time`; confirm indexing after successful settlement | Live metadata; public search confirmation pending |
| [x402-list](https://x402-list.com) | Manually reviewed directory of endpoints that return valid x402 challenges | Submit `/v1/time` for review | Probe passed; manual approval pending |
| [x402scan](https://x402scan.com) | Explorer for x402 activity and ecosystem resources | Verify the production settlement and resource appear | Verification pending |
| [OpenClaw ClawHub](https://clawhub.ai) | Searchable skill registry used directly by independent OpenClaw installations | Publish `openclaw/popcorn-temporal-anchor` | Package ready; publisher login required |

## Tier 2 — respected builder ecosystems

| Venue | Audience | Correct contribution |
| --- | --- | --- |
| [x402 Foundation GitHub](https://github.com/x402-foundation/x402) | Protocol implementers and wallet-enabled service builders | Submit POPCORN to the official ecosystem page under `Services/Endpoints` after the public repository is live |
| [Coinbase AgentKit](https://github.com/coinbase/agentkit) | Developers giving agents wallets and onchain actions | Publish a tested AgentKit integration example; propose an upstream contribution only if it matches the project wishlist |
| [OpenClaw](https://github.com/openclaw/openclaw) | Independent persistent-agent operators | Publish through ClawHub, document the use case, and share the verified skill—not unsolicited changes to OpenClaw core |
| [ElizaOS](https://github.com/elizaOS/eliza) | Open-source autonomous-agent and plugin developers | Build a POPCORN plugin or provider after the framework-specific contract is tested |
| [Daydreams](https://github.com/daydreamsai/daydreams) | Agents designed for commerce | Provide a small verified temporal-anchor example tied to a commerce execution window |

## Direct interoperability candidates

These are not directories. They are independent, wallet-enabled agent projects
whose public positioning closely matches POPCORN's buyer profile. Approach them
only with a reproducible integration—not a generic sales message.

| Project | Relevance | Useful proof to offer |
| --- | --- | --- |
| [Franklin](https://github.com/BlockRunAI/Franklin) | Autonomous agent with a USDC wallet and x402 purchasing | A verified paid temporal receipt before a bounded commerce action |
| [ClawRouter](https://github.com/BlockRunAI/ClawRouter) | OpenClaw-native x402 routing with wallet payment | The ClawHub skill plus a paid-call trace |
| [Internet Court skill](https://github.com/internet-court/internet-court-skill) | Agent-commerce mandates, payment, and dispute evidence | A portable time receipt attached to a locally authorized mandate |
| [Daydreams](https://github.com/daydreamsai/daydreams) | Commerce-focused autonomous-agent tooling | An execution-window example that uses POPCORN evidence before action |

## Tier 3 — discovery standards worth preparing

| Surface | When to use it |
| --- | --- |
| GitHub topics and search | Add `x402`, `ai-agents`, `agentic-commerce`, `base`, `usdc`, `temporal-evidence`, and `openclaw-skill` to the public repository |
| MCP Registry and reputable MCP directories | Only after POPCORN has a real MCP server or x402 MCP adapter; do not list a plain HTTP endpoint as an MCP server |
| Framework registries for LangGraph, CrewAI, Mastra, AutoGen, AG2, or PydanticAI | Add one only when a tested native adapter exists; a generic announcement is lower quality than a working integration |
| Base and x402 hackathons or demo days | Submit a reproducible paid call and receipt-verification demonstration |

## Official x402 ecosystem submission

The x402 Foundation accepts ecosystem additions by pull request. POPCORN fits
the `Services/Endpoints` category because it has a working Base mainnet
integration and public API documentation.

Proposed metadata:

```json
{
  "name": "POPCORN Temporal Anchor",
  "description": "Paid, signed bearer temporal evidence for time-sensitive autonomous-agent execution and cross-node audit.",
  "logoUrl": "/logos/popcorn-temporal-anchor.png",
  "websiteUrl": "https://767-2676.com/agents",
  "category": "Services/Endpoints"
}
```

Do not submit until the GitHub repository is public and its paid example has
been independently reproduced. The official ecosystem requirements call for a
working mainnet integration, API documentation, and high uptime.

## Quality rule

Do not broadcast the same generic announcement everywhere. Each venue should
receive a working artifact native to that ecosystem: a ClawHub skill, an x402
ecosystem entry, an AgentKit example, or a framework adapter. That is the agent
equivalent of earning a place on a trusted vendor list.

GitHub publication and post-publication commands are documented in
[`PUBLISHING.md`](PUBLISHING.md).
