# Reading editions

The `/editions/` index serves English source text, reversible written Morse and NATO notation, and English uncontracted UEB Braille with a downloadable BRF. Every edition names the exact archived HTML and its SHA-256. The homepage integration adds a dropdown and name field that work without JavaScript.

This is a partial delivery of the November 14 bridge instructions. Non-English translations, sign-language interpretation/agent, and Scout's separately built voice agent are not implemented. Their pages report that status; selecting a language does not invent an edition. There is no claim of universal accessibility or of human Braille proofreading/physical embossing testing.

The source is the complete published archive at `https://767-2676.com/evidence/homepage-before-split-2026-11-13.html`, not the shortened current homepage. Its 695,710 bytes have SHA-256 `3185cced81bd0eaaec771be6a02451406bf2d93176cb40d34aeeb34e667845e6`. The source file and generated payloads disable Git line-ending conversion. Never overwrite the retained source to update an edition: make a new version with its own digest.

## Reproduce and verify

Run from this directory using Node 22.16+ and Python 3.10+. See `ENCODINGS.md` for extraction boundaries and notation. See `braille/README.md` for the pinned native dependency and complete Braille build.

```sh
python extract_test.py
python extract.py source/canonical.html source/source-text.txt source/extraction.json
node --test encoders.test.mjs
python braille/test_braille.py
python braille/translate_braille.py source/source-text.txt braille/output --canonical-sha256 3185cced81bd0eaaec771be6a02451406bf2d93176cb40d34aeeb34e667845e6 --canonical-url https://767-2676.com/evidence/homepage-before-split-2026-11-13.html
node build.mjs --canonical source/canonical.html --text source/source-text.txt --extraction source/extraction.json --braille braille/output
node --no-warnings --loader ./test-loader.mjs ./release.test.mjs
```

`release.test.mjs` verifies the exact bytes of all 21 public files, GET/HEAD/ETag behavior, aliases, method rejection, and bounded same-origin form redirects. It can also take a local release directory containing `snapshot/active`, `snapshot/.state/settings.json` and `candidate` to compare existing production routes. The optional independent extraction audit requires `lxml`:

```sh
python verify-extraction.py source/canonical.html source/source-text.txt source/extraction-verification.json
```

## Production integration

Run `node site/editions/prepare-release.mjs FRESH_ACTIVE_MODULE_DIRECTORY NEW_CANDIDATE_DIRECTORY` from the repository root. The script changes only the homepage controls and their form policy, adds the editions router, and emits the new text/data modules. It proves that reversing those changes restores the complete original Worker and homepage. Existing modules, signed checkpoint, archive bytes, payment logic, keys, settings and assets must be preserved.

The generated `dist/worker.mjs` uses Cloudflare text imports and a binary BRF import. Upload `editions.mjs` as an ES module, all `editions-*` files as `text/plain`, except the BRF as `application/octet-stream`. The router supplies public content types. Do not deploy these assets as JavaScript modules merely because a filename ends in `.js`.

Read current production first; hold the publisher's shared lock while staging/activating; reject active-version or settings drift. Keep the paused historical receipt runner and its source-equality guard untouched. Run the existing production tests, stage and verify all module hashes, then activate and verify the public bodies. A Git merge alone does not deploy this Worker. Do not call paid endpoints for this release.

The repository's POPCORN Read-and-Use Terms remain in force. Liblouis is an external build dependency with its own notices; no native binaries are included here.
