# x402 payload-bound witness client

This example creates a portable, verifiable memory checkpoint:

1. serialize the exact checkpoint bytes locally;
2. hash those bytes with SHA-256;
3. create a fresh 32-byte nonce;
4. optionally hash the previous compact JWS to bind a specific predecessor;
5. pay `POST /v1/receipt` through x402 v2;
6. verify the POPCORN JWS, payload digest, nonce, time interval, and predecessor;
7. retain the original bytes, receipt, and returned `replay_key` locally.

The endpoint receives no original checkpoint payload. The receipt cannot
reconstruct the payload and does not prove identity, delivery, execution,
replay prevention, or authorization.

The canonical production service must advertise `POST /v1/receipt` in its live
offer before you run this example against `767-2676.com`.

```bash
npm install
cp .env.example .env
# Add a funded dedicated Base wallet private key locally. Never commit it.
npm run check
npm start
```

Making the paid request spends the toll advertised by the endpoint's current
x402 challenge. The example caps each payment at `$0.001`; also inspect the
challenge and apply wallet-level spend controls before pointing an autonomous
agent at mainnet.
