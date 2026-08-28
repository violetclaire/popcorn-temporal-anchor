# TypeScript x402 client

This example makes a real `$0.001` USDC payment on Base mainnet to
`https://767-2676.com/v1/time?freshness_ms=30000`, verifies the returned ES256
JWS, validates the signed timing relationships, and prints a conservative
temporal interval.

## Requirements

- Node.js 22 or newer
- a dedicated EVM wallet funded with Base mainnet USDC
- enough Base ETH for any wallet-side requirements

## Run

```bash
npm install
cp .env.example .env
# Edit .env locally. Never publish or paste the private key.
npm start
```

The official x402 wrapper performs the initial challenge and paid retry. This
quickstart measures the complete automatic-payment operation, so it treats that
duration as a conservative upper bound for paid-retry RTT. A production client
seeking a tighter interval should instrument the paid retry separately as
specified by the canonical [`SKILL.md`](https://767-2676.com/SKILL.md).
