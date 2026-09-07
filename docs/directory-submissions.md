# Directory submission status — September 7, 2026

## x402 List

POPCORN is listed. A request to revise its description and point to the free sample returned HTTP409: an ownership-verified update is already under review. No new update was queued, no domain token was changed, and no payment was made. The directory does not expose an API to replace that pending request. The revised description should be submitted after the current review resolves, if it is still needed.

Suggested description:

Signed time and digest witnesses for agents checking a cancellation deadline, quote expiry, authorization expiry, or execution window. Can I still cancel? Is this quote still valid? Which side of the deadline am I on? Inspect and run the free offline sample at https://767-2676.com/schedule/example: verify exact schedule bytes, a signed historical receipt, and rejection of a one-byte change. No wallet or payment for the sample. Fresh signed time and digest witnesses cost $0.001 USDC per request over x402 v2 on Base and require payment authorization. Historical sample evidence is not current time. POPCORN does not confirm availability, book services, or authorize actions. Agent discovery: https://767-2676.com/.well-known/ard.json . MCP setup: https://767-2676.com/agents .

## Hugging Face

`integrations/huggingface-space/` is a prepared Docker Space directory serving the exact sample and agent instructions. Local HTTP route and offline verifier checks passed. Docker itself and deployment on Hugging Face have not been tested. Publishing needs an authorized Hugging Face account. Use free CPU hardware and no secrets. After it reaches RUNNING, retest the Hugging Face Discover Spaces search; publication does not guarantee search inclusion.

## Smithery

Publishing needs an authorized Smithery account. The current POPCORN MCP package uses local stdio; it is not a remotely hosted Streamable HTTP server. Smithery documents MCPB bundle publishing for local stdio. Packaging and account publishing are still outstanding. Do not submit the ordinary HTTP time endpoint as an MCP endpoint.

References:
- https://x402-list.com/llms-full.txt
- https://huggingface.co/docs/hub/spaces-sdks-docker
- https://smithery.ai/docs/build/publish
