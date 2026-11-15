# Canonical text extraction and mechanical encodings

These tools operate offline on the retained canonical HTML snapshot. They do not fetch the website, modify canonical pages, call receipt endpoints, execute printed code, or store reader state.

`source/canonical.html` is an exact byte copy of the published November 13 full homepage archive. Its 695,710 bytes have SHA-256 `3185cced81bd0eaaec771be6a02451406bf2d93176cb40d34aeeb34e667845e6`. `source/manifest.json` identifies its source address and byte digest. This is the digest printed on the editions. The extracted text has its own separate digest; it must never be substituted for the canonical HTML digest.

## Offline reproduction

Run these commands from this directory with Python 3.10+ and Node.js 22.16+:

```sh
python extract_test.py
python extract.py source/canonical.html source/source-text.txt source/extraction.json
node --test encoders.test.mjs
```

Extraction needs only Python's standard library. The JS encoders use no external dependencies. To reproduce the optional independent completeness audit, use an environment with `lxml` installed:

```sh
python verify-extraction.py source/canonical.html source/source-text.txt source/extraction-verification.json
```

The independent audit checks that all 111 preformatted blocks occur unchanged and in order in the extracted text. It also compares every non-whitespace character in the entire body against a separate `lxml` parse. The retained report records the result and individual preformatted block digests. No network access is needed to run it after the dependency is installed.

The page builder accepts the retained snapshot and extracted files explicitly:

```sh
node build.mjs --canonical source/canonical.html --text source/source-text.txt --extraction source/extraction.json --braille PATH_TO_PREBUILT_BRAILLE_DIRECTORY
```

The Braille directory must contain `braille-report.json`, `braille-unicode.txt` and `braille.brf` produced from the same canonical and extracted-text digests. Braille generation has separate Liblouis dependencies and instructions. This command renders already generated Braille; it never translates languages or downloads a translator.

## Extraction boundaries

The extractor decodes UTF-8 strictly, applies HTML line-ending preprocessing, decodes HTML character references, and walks all body character data in document order. It excludes head metadata, comments, scripts, style rules and templates. Outside `pre`, it collapses ordinary HTML whitespace, inserts line breaks for block boundaries, and tabs between table cells. Inside `pre`, it preserves all character data and whitespace, including code, payloads and archived documents. It does not execute any code.

The resulting 534,773-byte UTF-8 text has 534,457 Unicode code points and SHA-256 `13f601e285de4ad1e785302d7be60fdce1486d13ef2f3c587472aecbf5faae93`. It contains no added editorial prose. Attributes such as the single `aria-label` are recorded in `extraction.json` rather than injected into the canonical text.

The mirror SVG has its authored `leTAIN` title, 53 paths and 319 `use` elements, but no SVG text elements. Its actual title is retained. Words drawn as glyph outlines, layout and CSS-generated duplicate labels are not transcribed. A text extraction is not a complete tactile or visual transcription of that artwork. The edition must state that limitation and link the exact source.

## Reversible written notation

Every extracted source character is represented. One ASCII space separates character tokens. A bare `/` token represents exactly one source ASCII space; repeated spaces produce repeated `/` tokens. Source LF line breaks remain LF line breaks. Tabs, CR, nonbreaking spaces and other unsupported characters are represented explicitly as `{U+XXXX}` Unicode code-point tokens. Supplementary Unicode code points use additional hexadecimal digits.

Morse and NATO do not encode letter case. This edition prefixes a lowercase letter's token with `{lc}`: for example, `a` becomes `{lc}.-` in Morse and `{lc}Alfa` in NATO. Uppercase `A` is `.-` or `Alfa`. These prefixes and Unicode escapes are an application notation, not part of International Morse or the NATO alphabet. Their documentation makes exact round-trip recovery possible without discarding case or inventing alphabet signals.

The literal source characters `{`, `}`, and the escape-looking text `{U+0041}` are encoded character by character. They cannot collide with generated escape notation. The source slash `/` is `-..-.` in Morse and `{U+002F}` in NATO; it cannot be confused with a space token.

`encoders.mjs` exports `encode`, `decode`, `coverage`, `encodeMorse`, `decodeMorse`, `encodeNato`, `decodeNato`, `NOTATION`, and `SOURCES`. `coverage` counts every source code point by representation and inventories explicit Unicode escapes. The builder verifies that each complete encoded document decodes to the exact original extracted text. `source/encoding-verification.json` records that check for this snapshot.

## Alphabet sources and limits

Morse character signals come from [ITU-R M.1677-1, Annex 1, Part I](https://www.itu.int/dms_pubrec/itu-r/rec/m/R-REC-M.1677-1-200910-I!!PDF-E.pdf). The supported written subset includes A–Z, accented É, digits and the documented punctuation. ASCII punctuation is used for the corresponding punctuation class. Unicode variants are escaped rather than silently replaced. The multiplication sign is escaped because its standard Morse signal is also the letter X; escaping preserves the distinction. No national extensions or improvised signals are used. This is written Morse, not timing-controlled audio or an operational radio transmission.

NATO letter spellings come from [NATO's official alphabet history](https://www.nato.int/en/about-us/nato-history/history-by-theme/symbols-of-nato/nato-phonetic-alphabet), including `Alfa`, `Juliett` and `X-ray`. Digits use the written names in [NATO's alphabet, codes and signals poster](https://www.nato.int/content/dam/nato/webready/news/2010-2019/2017/12/21/20180111_nato-alphabet-sign-signal.pdf), one digit at a time. All punctuation is explicitly escaped; the tool does not invent NATO code words for punctuation. Spoken pronunciation cues such as "nin-er" are not substituted for the written digit name `Nine`.

Neither encoding performs translation, transliteration, accent stripping, smart-punctuation replacement or content summarization. Language editions remain outside this stage.
