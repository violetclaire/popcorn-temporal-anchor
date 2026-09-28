## Witness-layer agent documentation

The approved text is in `docs/witness-layer.md`. The production Worker serves it in `/agents`, `/agent-entry`, `/llms.txt`, `/agent-entry.md`, and `/agents.md`.

Run `node site/agent-docs/update-worker.mjs` from the repository root after changing the document. The updater changes only these five embedded documentation assets. It preserves every other public asset and every Worker byte outside that asset map.

Run `npm test` in `worker/production` before publication. Apply the same updater to a fresh authenticated snapshot of the active Worker, preserve settings and supporting modules, and retain the exact signed checkpoint. Hold the hourly runner's shared lock while publishing and synchronizing its reviewed documentation baseline; the runner's source-equality guard must remain intact.
