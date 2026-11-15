# Pinned English UEB build

This generator calls the official Liblouis 3.39.0 Windows x64 library directly through Python ctypes, using `en-ueb-g1.ctb`, `unicode.dis` and `en-us-brf.dis`. The native library must report 4-byte Unicode. No translator service, wallet, or network is used during translation.

Download `liblouis-3.39.0-win64.zip` from the [official 3.39.0 release](https://github.com/liblouis/liblouis/releases/tag/v3.39.0). Verify SHA-256 `64d669ac30f1411e0023b1cecc81c7a7b5374678ee41302c95ac8c7c8fbc6591` before extracting to `vendor/liblouis-3.39.0-win64`. Retain the release's license and copyright notices. `bin/liblouis.dll` must have SHA-256 `0f1194748deae4d2fc23888ae0787a5870b29a5a1095ab919b2a851ada020763`; no Authenticode signature assurance is claimed. The binary and tables are not distributed in this repository.

From `site/editions`, run the commands in the parent README. `--vendor` can select the verified extracted release directory. Do not use `--input-includes-prologue` for the retained raw source text: the generator adds the source URL and complete canonical digest itself.

The current full build has 866 BRF pages with a maximum of 40 cells per line and 25 lines per page, CRLF lines and form-feed page breaks. It explicitly describes all 383 character-tabulation occurrences. It checks full native input consumption, six-dot output, Unicode/BRF dot parity, reconstruction of wrapped cells and the source URL/digest in the actual serialized BRF preface. Nine fixture tests cover literal backslashes, Unicode, controls and layout. The machine report records the native library and transitive table hashes.

`output/` contains the full intermediate layout and substitution records and is ignored to avoid duplicating the published files in `../dist/`. Regenerate it with the pinned dependency when auditing the translation.

This is mechanical English uncontracted UEB. Human Braille proofreading and physical embossing are still unverified. Foreign-language Braille correctness, spatial mathematics and a tactile transcription of the mirror artwork are not claimed. Back-translation is diagnostic and cannot prove exact original punctuation or formatting; retain the source text and HTML.
