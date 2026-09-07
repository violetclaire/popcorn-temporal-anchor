# Directory submission status — September 7, 2026

## x402 List

POPCORN is listed. A request to revise its description and point to the free sample returned HTTP409: an ownership-verified update is already under review. No new update was queued, no domain token was changed, and no payment was made. The directory does not expose an API to replace that pending request. The revised description should be submitted after the current review resolves, if it is still needed.

Suggested description:

Signed time and digest witnesses for agents checking a cancellation deadline, quote expiry, authorization expiry, or execution window. Can I still cancel? Is this quote still valid? Which side of the deadline am I on? Inspect and run the free offline sample at https://767-2676.com/schedule/example: verify exact schedule bytes, a signed historical receipt, and rejection of a one-byte change. No wallet or payment for the sample. Fresh signed time and digest witnesses cost $0.001 USDC per request over x402 v2 on Base and require payment authorization. Historical sample evidence is not current time. POPCORN does not confirm availability, book services, or authorize actions. Agent discovery: https://767-2676.com/.well-known/ard.json . MCP setup: https://767-2676.com/agents .

## Hugging Face

Published: https://huggingface.co/spaces/violetclaire/767-2676.com . Account: https://huggingface.co/violetclaire . The public API reports RUNNING with the static SDK. README.md, index.html, and agents.md returned HTTP 200 and are mirrored in integrations/huggingface-space/. The page links to the canonical sample for download, inspection, and offline execution; it does not execute the verifier inside the Space.

The account creation UI required PRO for Docker/Gradio, so the deployed Space uses free static hosting. Dockerfile and server.mjs are an undeployed alternative, not the live Space. No paid plan or hardware was selected.

After publication, Hugging Face Discover Spaces searches for “POPCORN task time” and “Can I still cancel? Is this quote still valid?” returned HTTP 200 with empty results. Search inclusion remains unconfirmed. Publication alone does not establish discovery or adoption.

## Smithery

Publishing needs an authorized Smithery account. The current POPCORN MCP package uses local stdio; it is not a remotely hosted Streamable HTTP server. Smithery documents MCPB bundle publishing for local stdio. Packaging and account publishing are still outstanding. Do not submit the ordinary HTTP time endpoint as an MCP endpoint.

References:
- https://x402-list.com/llms-full.txt
- https://huggingface.co/docs/hub/spaces-sdks-docker
- https://smithery.ai/docs/build/publish

## Latest discovery retest

September 7: all 12 public discovery/sample routes returned 200. A fresh sample download matched the previously inspected source and executed with signature/digest/tamper checks passing. HF ordinary name search returned the Space, but both tested HF Discover queries returned empty results. The generated skill route returned 502 while fetching the Hub /agents.md endpoint; the static app /agents.md returned 200. This is an upstream discovery-path incompatibility, not proof of organic discovery. Direct sample and instruction links remain usable.

## Domain naming repair

The Space was renamed to `violetclaire/767-2676.com` and its display title now starts with the domain. Ordinary Hub search for `767-2676.com` now returns it. The old Space link redirects. HF Discover semantic search still returned no results immediately after the rename; its generated skill still returns 502. A fallback repair is being prepared against hf-discover; it is not deployed upstream. Direct repository and static-host instruction URLs work.
