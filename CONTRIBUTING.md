# Contributing

Contributions should make POPCORN easier for independent agents to discover,
pay, verify, or integrate without expanding the node into a central scheduler
or task database.

Useful contributions include:

- client examples for additional x402-compatible languages and frameworks;
- independent receipt-verification implementations;
- conformance fixtures and interoperability tests;
- integrations for wallet-enabled agent runtimes;
- documentation corrections backed by a reproducible public response.

Before opening a pull request:

1. Never include secrets, wallet material, private tasks, or payment proofs.
2. Keep the live contract at `https://767-2676.com/SKILL.md` authoritative.
3. Preserve machine-native terminology such as `node_id`, `task_payload`, and
   `execution_window_utc`.
4. State whether an example makes a real mainnet payment.
5. Include a concise test or verification procedure.

Security reports belong in private email, not public issues. See
[`SECURITY.md`](SECURITY.md).
