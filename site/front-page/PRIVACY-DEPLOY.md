# Publish /privacy

`privacy.html` is a standalone page for `/privacy` and `/privacy/`, matching
the existing green and cream pages. It contains no scripts, forms, external
fonts, cookies, or tracking requests.

GitHub changes do not deploy the Cloudflare Worker. Follow OPERATOR.md:

1. Download the currently deployed Worker and keep a backup.
2. Inspect its request handler. From this directory run:
   `node patch-privacy.mjs downloaded-worker.js patched-worker.js`.
   The patch refuses missing/ambiguous anchors or an existing explicit privacy
   route. If it refuses, inspect and adapt to the current source; do not deploy
   a stale Worker or run the old homepage patch to add this page.
3. Review the diff. Only the two privacy routes should be added. Preserve
   signing keys, bindings, other routes, and deployment configuration.
4. Deploy through the existing Cloudflare account and verify GET and HEAD at
   both privacy paths. Check the actual HTML and contact link on the live URL.
   Do not call paid endpoints as part of this check.

The wording follows docs/WITNESS_PROTOCOL.md and the owner's stated practices.
It distinguishes offline verification from website requests and wallet
addresses from associated public payment records. Production logging settings
and retention have not been independently audited; no retention duration or
zero-hosting-logs promise is invented here. Confirm the owner's no-tracking,
no-ads, and no-sale statements remain accurate before publication.

The code fixture check validates the additive patch and HTTP behavior; it is
not proof of compatibility with an unseen deployed Worker or a live deploy.
