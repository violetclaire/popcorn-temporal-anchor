"""Pinned Liblouis UEB grade-1 translation and auditable BRF layout.

Uses the native library directly: input backslashes are literal, and every
native call must consume its complete input. No network or canonical writes.
"""
from __future__ import annotations

import argparse
from collections import Counter
import ctypes as C
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor" / "liblouis-3.39.0-win64"
ZIP_SHA256 = "64d669ac30f1411e0023b1cecc81c7a7b5374678ee41302c95ac8c7c8fbc6591"
TABLE = "en-ueb-g1.ctb"
BLANK = "\u2800"
CONTINUATION = "\u2810"  # UEB dot-5, inserted only at non-space line breaks.
NO_UNDEFINED = 128  # Diagnostic calls only. Never used for published output.


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def character_name(char: str) -> str:
    controls = {"\t": "CHARACTER TABULATION", "\n": "LINE FEED", "\r": "CARRIAGE RETURN",
                "\f": "FORM FEED", "\v": "LINE TABULATION", "\x1b": "ESCAPE", "\x7f": "DELETE"}
    return controls.get(char, unicodedata.name(char, "UNNAMED"))


@dataclass
class Translation:
    cells: str
    input_positions: list[int]


class Louis:
    def __init__(self, vendor: Path = VENDOR):
        self.vendor = vendor.resolve()
        self.tables = self.vendor / "share" / "liblouis" / "tables"
        dll = self.vendor / "bin" / "liblouis.dll"
        loader = C.WinDLL if os.name == "nt" else C.CDLL
        self.dll = loader(str(dll))
        self.dll.lou_version.argtypes = []
        self.dll.lou_version.restype = C.c_char_p
        self.dll.lou_charSize.argtypes = []
        self.dll.lou_charSize.restype = C.c_int
        self.dll.lou_checkTable.argtypes = [C.c_char_p]
        self.dll.lou_checkTable.restype = C.c_int
        self.dll.lou_translate.argtypes = [
            C.c_char_p, C.c_void_p, C.POINTER(C.c_int), C.c_void_p,
            C.POINTER(C.c_int), C.c_void_p, C.c_void_p,
            C.POINTER(C.c_int), C.POINTER(C.c_int), C.c_void_p, C.c_int,
        ]
        self.dll.lou_translate.restype = C.c_int
        self.dll.lou_backTranslateString.argtypes = [
            C.c_char_p, C.c_void_p, C.POINTER(C.c_int), C.c_void_p,
            C.POINTER(C.c_int), C.c_void_p, C.c_void_p, C.c_int,
        ]
        self.dll.lou_backTranslateString.restype = C.c_int
        self.dll.lou_free.argtypes = []
        self.dll.lou_free.restype = None
        self.version = self.dll.lou_version().decode("ascii")
        self.width = self.dll.lou_charSize()
        if self.version != "3.39.0" or self.width != 4:
            raise RuntimeError(f"Expected pinned 3.39.0 UCS-4 build; got {self.version}/{self.width}")
        self.encoding = "utf-32-le"
        self.tablelists = {}
        for display in ["unicode.dis", "en-us-brf.dis"]:
            tablelist = ",".join(str(self.tables / name) for name in [display, TABLE])
            encoded = tablelist.encode("mbcs" if os.name == "nt" else "utf-8")
            if not self.dll.lou_checkTable(encoded):
                raise RuntimeError(f"Liblouis table did not compile: {display}, {TABLE}")
            self.tablelists[display] = encoded
        self.unicode_to_brf = read_brf_mapping(self.tables / "en-us-brf.dis")
        self.brf_to_unicode = {v: k for k, v in self.unicode_to_brf.items()}

    def close(self):
        self.dll.lou_free()

    def table_provenance(self) -> dict:
        pending, hashes = [TABLE, "unicode.dis", "en-us-brf.dis"], {}
        while pending:
            name = pending.pop()
            if name in hashes:
                continue
            file = (self.tables / name).resolve()
            if not file.is_relative_to(self.tables.resolve()):
                raise ValueError("Table dependency escapes vendor directory")
            data = file.read_bytes()
            hashes[name] = sha(data)
            for line in data.decode("utf-8-sig").splitlines():
                fields = line.split()
                if len(fields) >= 2 and fields[0] == "include":
                    pending.append(fields[1])
        return dict(sorted(hashes.items()))

    def translate(self, text: str, display="unicode.dis", diagnostic=False) -> Translation:
        if not text:
            return Translation("", [])
        if "\0" in text:
            raise ValueError("Embedded NUL cannot be translated without loss; source unchanged")
        encoded = text.encode(self.encoding, "strict")
        input_units = len(encoded) // self.width
        source = C.create_string_buffer(encoded)
        capacity = max(64, input_units * 12 + 32)
        for _ in range(5):
            inlen, outlen = C.c_int(input_units), C.c_int(capacity)
            output = C.create_string_buffer(capacity * self.width)
            input_positions = (C.c_int * capacity)()
            output_positions = (C.c_int * input_units)()
            ok = self.dll.lou_translate(
                self.tablelists[display], source, C.byref(inlen), output,
                C.byref(outlen), None, None, output_positions, input_positions,
                None, NO_UNDEFINED if diagnostic else 0,
            )
            if not ok:
                raise RuntimeError(f"Liblouis translation failed ({display})")
            if inlen.value == input_units:
                cells = output.raw[:outlen.value * self.width].decode(self.encoding, "strict")
                return Translation(cells, list(input_positions[:outlen.value]))
            capacity *= 2
        raise RuntimeError("Liblouis only consumed part of the input; refusing incomplete output")

    def back_translate(self, cells: str, display="unicode.dis") -> str:
        if not cells:
            return ""
        encoded = cells.encode(self.encoding)
        source = C.create_string_buffer(encoded)
        units = len(encoded) // self.width
        capacity = max(64, units * 16 + 32)
        inlen, outlen = C.c_int(units), C.c_int(capacity)
        output = C.create_string_buffer(capacity * self.width)
        ok = self.dll.lou_backTranslateString(
            self.tablelists[display], source, C.byref(inlen), output,
            C.byref(outlen), None, None, 0,
        )
        if not ok or inlen.value != units:
            raise RuntimeError("Incomplete back translation")
        return output.raw[:outlen.value * self.width].decode(self.encoding)

    def pair(self, text: str) -> tuple[Translation, str]:
        unicode = self.translate(text)
        brf = self.translate(text, "en-us-brf.dis").cells
        bad = [f"U+{ord(c):04X}" for c in unicode.cells if not 0x2800 <= ord(c) <= 0x283F]
        if bad:
            raise ValueError(f"Translation contains non-six-dot output: {sorted(set(bad))}")
        mapped = "".join(self.unicode_to_brf[c] for c in unicode.cells)
        if mapped != brf:
            raise AssertionError("Native Unicode/BRF translations are not dot-equivalent")
        return unicode, brf


def read_brf_mapping(table: Path) -> dict[str, str]:
    """Read display encodings from the pinned upstream table, not a letter map."""
    result = {}
    for line in table.read_text(encoding="utf-8").splitlines():
        if not line.startswith("display "):
            continue
        _, character, dots, *_ = line.split()
        character = {r"\s": " ", r"\\": "\\"}.get(character, character)
        bits = 0 if dots == "0" else sum(1 << (int(d) - 1) for d in dots)
        if len(character) != 1 or bits > 63:
            raise AssertionError("Unexpected BRF display mapping")
        result[chr(0x2800 + bits)] = character
    if len(result) != 64 or len(set(result.values())) != 64:
        raise AssertionError("BRF table is not a bijection over all 64 six-dot cells")
    return result


def character_diagnostics(engine: Louis, text: str) -> dict:
    counts = Counter(text)
    unknown, empty, non_six_dot, control = [], [], [], []
    for char, count in sorted(counts.items(), key=lambda item: ord(item[0])):
        if char in "\r\n":
            continue  # Preserved as document line boundaries, outside translation.
        normal = engine.translate(char).cells
        diagnostic = engine.translate(char, diagnostic=True).cells
        record = {"codepoint": f"U+{ord(char):04X}", "name": character_name(char), "count": count}
        if unicodedata.category(char) in ("Cc", "Cf"):
            control.append(record)
        if normal != diagnostic:
            unknown.append({**record, "policy": "Explicit Unicode codepoint/name transcription; original source companion retained"})
        if not normal:
            empty.append(record)
        elif any(not 0x2800 <= ord(c) <= 0x283F for c in normal):
            non_six_dot.append(record)
    return {
        "unknown_unique_codepoints": len(unknown),
        "unknown_occurrences": sum(x["count"] for x in unknown),
        "unknown_characters": unknown,
        "empty_single_character_translations": empty,
        "non_six_dot_single_character_translations": non_six_dot,
        "control_and_format_characters": control,
        "note": "Single-character diagnostics; line-level diagnostic differences are also reported. Contextual combining rules may differ from isolated characters.",
    }


def wrap_line(source: str, translated: Translation, width=40) -> list[dict]:
    """Preserve all translated cells; log every added continuation cell.

    Word-boundary wraps keep their blank cell (even at the end of a line).
    Unbroken technical strings use dot-5 and never split a source-character's
    multi-cell representation. This is a mechanical layout, not certification.
    """
    cells, positions = translated.cells, translated.input_positions
    if not cells:
        return [{"start": 0, "end": 0, "cells": "", "continuation": False}]
    rows, start = [], 0
    while len(cells) - start > width:
        edge = start + width
        space = cells.rfind(BLANK, start, edge + 1)
        if space > start:
            # A blank just outside the physical line is consumed on the next
            # row; a blank within it remains an actual cell, never discarded.
            cut = min(space + 1, edge)
            continuation = False
        else:
            boundaries = [i for i in range(start + 1, start + width)
                          if positions[i] != positions[i - 1]]
            if not boundaries:
                raise ValueError("One source character exceeds the BRF line width")
            preferred = [i for i in boundaries if 0 <= positions[i - 1] < len(source)
                         and source[positions[i - 1]] in "/:.?&#=_-"]
            cut = preferred[-1] if preferred and preferred[-1] >= start + width // 2 else boundaries[-1]
            continuation = True
        row = cells[start:cut] + (CONTINUATION if continuation else "")
        assert len(row) <= width
        rows.append({"start": start, "end": cut, "cells": row, "continuation": continuation})
        start = cut
    rows.append({"start": start, "end": len(cells), "cells": cells[start:], "continuation": False})
    restored = "".join(row["cells"][:-1] if row["continuation"] else row["cells"] for row in rows)
    assert restored == cells, "Layout lost or changed translated cells"
    return rows


def make_brf(rows: list[dict], mapping: dict[str, str], lines_per_page=25) -> bytes:
    encoded = ["".join(mapping[c] for c in row["cells"]) for row in rows]
    pages = ["\r\n".join(encoded[i:i + lines_per_page]) + "\r\n"
             for i in range(0, len(encoded), lines_per_page)]
    result = "\f".join(pages).encode("ascii")
    for page in result.decode("ascii").split("\f"):
        lines = page.removesuffix("\r\n").split("\r\n")
        assert len(lines) <= lines_per_page
        assert all(len(line) <= 40 for line in lines)
    assert all(0x20 <= b <= 0x5F or b in (10, 12, 13) for b in result)
    return result


def build(input_path: Path, output_dir: Path, canonical_sha256: str, vendor=VENDOR,
          input_includes_prologue=False, canonical_url="https://767-2676.com/") -> dict:
    if not re.fullmatch(r"[a-fA-F0-9]{64}", canonical_sha256):
        raise ValueError("Provide the exact canonical HTML SHA-256 as 64 hexadecimal digits")
    source_bytes = input_path.read_bytes()
    text = source_bytes.decode("utf-8", "strict")
    if "\0" in text:
        raise ValueError("Embedded NUL in source; refusing ambiguous native input")
    # Line separators are document structure; keep all text and blank lines.
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if input_includes_prologue and (canonical_sha256.lower() not in normalized.lower()
                                    or canonical_url not in normalized):
        raise ValueError("Input prologue must include canonical URL and exact contiguous SHA-256")
    header = ("POPCORN. Unified English Braille, uncontracted edition.\n"
              "Canonical URL: " + canonical_url + "\n"
              "Canonical HTML SHA256: " + canonical_sha256.lower() + ".\n"
              "BRF layout: 40 cells per line, 25 lines per page.\n"
              "Transcription note: automatic Liblouis translation. Unsupported characters are represented by their Unicode codepoint and name. "
              "Long unbroken strings in the BRF use the dot five continuation sign.\n\n")
    engine = Louis(vendor)
    try:
        diagnostics = character_diagnostics(engine, normalized)
        fallback_records = {r["codepoint"]: r for key in ["unknown_characters", "empty_single_character_translations", "non_six_dot_single_character_translations", "control_and_format_characters"] for r in diagnostics[key]}
        substitutions = []
        substituted = []
        for offset, char in enumerate(normalized):
            codepoint = f"U+{ord(char):04X}"
            if codepoint in fallback_records:
                replacement = f"[Unicode {codepoint}: {character_name(char)}]"
                substitutions.append({"normalized_source_codepoint_offset": offset, "codepoint": codepoint, "replacement": replacement})
                substituted.append(replacement)
            else:
                substituted.append(char)
        diagnostics["explicit_substitution_occurrences"] = len(substitutions)
        diagnostics["explicit_substitution_unique_codepoints"] = len(fallback_records)
        document = ("" if input_includes_prologue else header) + "".join(substituted)
        unicode_lines, brf_lines, layout = [], [], []
        contextual_differences = []
        for number, line in enumerate(document.split("\n"), 1):
            translated, brf_line = engine.pair(line)
            unicode_lines.append(translated.cells)
            brf_lines.append(brf_line)
            if engine.translate(line, diagnostic=True).cells != translated.cells:
                contextual_differences.append(number)
            for row in wrap_line(line, translated):
                layout.append({"source_line": number, **row})
        unicode_bytes = "\n".join(unicode_lines).encode("utf-8")
        raw_brf_bytes = "\n".join(brf_lines).encode("ascii")
        brf_bytes = make_brf(layout, engine.unicode_to_brf)
        # Verify the serialized BRF itself, not just the pre-serialization rows.
        physical_lines = []
        for page in brf_bytes.decode("ascii").split("\f"):
            physical_lines.extend(page.removesuffix("\r\n").split("\r\n"))
        assert len(physical_lines) == len(layout)
        for actual, row in zip(physical_lines, layout):
            assert "".join(engine.brf_to_unicode[c] for c in actual) == row["cells"]
        # Reconstruct the serialized preface, removing only recorded layout
        # continuations, and check the URL/digest after native back translation.
        preface_cells = {}
        for actual, row in zip(physical_lines, layout):
            if row["source_line"] > 4:
                break
            cells = "".join(engine.brf_to_unicode[c] for c in actual)
            if row["continuation"]:
                assert cells.endswith(CONTINUATION)
                cells = cells[:-1]
            preface_cells[row["source_line"]] = preface_cells.get(row["source_line"], "") + cells
        preface_text = "\n".join(engine.back_translate(cells) for cells in preface_cells.values())
        if not input_includes_prologue:
            assert canonical_url.lower() in preface_text.lower(), "Serialized BRF lost source URL"
            assert canonical_sha256.lower() in preface_text.lower(), "Serialized BRF lost source digest"
        diagnostics["lines_with_undefined_fallback_after_explicit_substitution"] = contextual_differences
        diagnostics["line_level_unknown_check_passed"] = not contextual_differences
        if not diagnostics["line_level_unknown_check_passed"]:
            raise ValueError("Contextual unsupported symbols differ from the character inventory; inspect before publishing")
        paginated_unicode = "".join(c if c in "\r\n\f" else engine.brf_to_unicode[c]
                                    for c in brf_bytes.decode("ascii")).encode("utf-8")
        # Explicitly surface defined-but-empty isolated translations for review.
        report = {
            "status": "generated", "canonical_html_sha256": canonical_sha256.lower(),
            "canonical_url": canonical_url, "input_includes_prologue": input_includes_prologue,
            "input_text_sha256": sha(source_bytes), "input_bytes": len(source_bytes),
            "input_unicode_codepoints": len(text), "input_lf_count": text.count("\n"),
            "input_cr_count": text.count("\r"), "line_separator_policy": "CRLF and CR represented as LF in Unicode edition; BRF uses CRLF and FF",
            "liblouis_version": engine.version, "widechar_bytes": engine.width,
            "library_sha256": sha((engine.vendor / "bin" / "liblouis.dll").read_bytes()),
            "official_release_zip_sha256": ZIP_SHA256,
            "translation_table": TABLE, "display_tables": ["unicode.dis", "en-us-brf.dis"],
            "table_sha256": engine.table_provenance(),
            "six_dot_only": True, "native_unicode_brf_dot_equivalence": True,
            "serialized_brf_preface_checked": not input_includes_prologue,
            "paginated_unicode_brf_dot_equivalence": True,
            "all_native_input_consumed": True, "layout_roundtrip_preserves_translated_cells": True,
            "brf_cells_per_line_max": 40, "brf_lines_per_page_max": 25,
            "brf_pages": brf_bytes.count(b"\f") + 1, "brf_physical_lines": len(layout),
            "continuation_cells_inserted": sum(r["continuation"] for r in layout),
            "diagnostics": diagnostics,
            "limitations": [
                "English uncontracted UEB table; non-English text is not certified as correct foreign-language braille.",
                "Linear math only as supported by the UEB table. No semantic MathML, spatial math, or tactile artwork transcription.",
                "Mechanical 40 by 25 layout; long technical strings use dot-5 continuations. Human Braille proofreading and embosser testing have not occurred.",
                "The source digest identifies the original canonical bytes; translated files necessarily have different bytes.",
                "A reverse text translation is a diagnostic and cannot prove exact original spelling, punctuation, or formatting.",
            ],
        }
        outputs = {"braille-unicode.txt": unicode_bytes, "braille-paginated-unicode.txt": paginated_unicode,
                   "braille-unwrapped.brf.txt": raw_brf_bytes, "braille.brf": brf_bytes,
                   "braille-source-exact.txt": source_bytes}
        report["outputs"] = {name: {"bytes": len(data), "sha256": sha(data)} for name, data in outputs.items()}
        output_dir.mkdir(parents=True, exist_ok=True)
        for name in [*outputs, "braille-report.json", "braille-layout.json", "braille-substitutions.json"]:
            if (output_dir / name).resolve() == input_path.resolve():
                raise ValueError("Output would overwrite source")
        for name, data in outputs.items():
            (output_dir / name).write_bytes(data)
        (output_dir / "braille-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (output_dir / "braille-layout.json").write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        (output_dir / "braille-substitutions.json").write_text(json.dumps(substitutions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        assert input_path.read_bytes() == source_bytes, "Input source changed"
        return report
    finally:
        engine.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="UTF-8 extracted canonical text; never modified")
    parser.add_argument("output", type=Path, help="Directory for derivative editions and QA records")
    parser.add_argument("--canonical-sha256", required=True)
    parser.add_argument("--canonical-url", default="https://767-2676.com/")
    parser.add_argument("--vendor", type=Path, default=VENDOR)
    parser.add_argument("--input-includes-prologue", action="store_true",
                        help="Input already contains title/URL/digest/UEB/layout notes; do not add another prologue")
    args = parser.parse_args()
    report = build(args.input, args.output, args.canonical_sha256, args.vendor, args.input_includes_prologue, args.canonical_url)
    print(json.dumps({k: report[k] for k in ["status", "canonical_html_sha256", "brf_pages", "continuation_cells_inserted", "diagnostics", "outputs"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
