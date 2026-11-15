import json
from pathlib import Path
import unittest

from translate_braille import Louis, build, make_brf, wrap_line, ROOT, BLANK


class NativeBrailleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = Louis()

    @classmethod
    def tearDownClass(cls):
        cls.engine.close()

    def test_known_ueb_grade_one(self):
        self.assertEqual(self.engine.pair("Hello world.")[1], ",HELLO WORLD4")
        self.assertEqual(self.engine.pair("the and for of with")[1], "THE AND FOR OF WITH")
        self.assertEqual(self.engine.pair("123")[1], "#ABC")

    def test_literal_backslash_never_uses_cli_escape_parser(self):
        source = r"\x0041 \n \y1F9FF C:\path"
        unicode, brf = self.engine.pair(source)
        self.assertIn("_*X#JJDA", brf)
        self.assertEqual(self.engine.back_translate(unicode.cells), source)

    def test_large_input_fully_consumed(self):
        source = "abc123 def456 " * 3000
        unicode, _ = self.engine.pair(source)
        self.assertGreater(len(unicode.cells), 32000)
        self.assertEqual(self.engine.back_translate(unicode.cells), source)

    def test_full_six_dot_display_bijection(self):
        mapping = self.engine.unicode_to_brf
        self.assertEqual(set(mapping), {chr(0x2800 + n) for n in range(64)})
        self.assertEqual({self.engine.brf_to_unicode[v] for v in mapping.values()}, set(mapping))
        self.assertEqual(mapping[BLANK], " ")

    def test_long_string_layout_retains_all_cells(self):
        source = "https://example.com/" + "Abc123" * 60
        translated, _ = self.engine.pair(source)
        rows = wrap_line(source, translated)
        self.assertGreater(sum(r["continuation"] for r in rows), 2)
        self.assertTrue(all(len(r["cells"]) <= 40 for r in rows))
        restored = "".join(r["cells"][:-1] if r["continuation"] else r["cells"] for r in rows)
        self.assertEqual(restored, translated.cells)
        for row in rows[:-1]:
            if row["continuation"]:
                i = row["end"]
                self.assertNotEqual(translated.input_positions[i - 1], translated.input_positions[i])

    def test_word_wrap_retains_spaces(self):
        source = "".join(["alpha  beta   gamma delta " for _ in range(20)])
        translated, _ = self.engine.pair(source)
        rows = wrap_line(source, translated)
        self.assertFalse(any(r["continuation"] for r in rows))
        self.assertEqual("".join(r["cells"] for r in rows), translated.cells)

    def test_pages_crlf_formfeed_and_actual_mapping(self):
        rows = [{"cells": self.engine.pair("Page row 123.")[0].cells} for _ in range(61)]
        brf = make_brf(rows, self.engine.unicode_to_brf)
        self.assertEqual(brf.count(b"\f"), 2)
        self.assertEqual([p.count(b"\r\n") for p in brf.split(b"\f")], [25, 25, 11])
        for line in brf.decode().replace("\f", "").split("\r\n")[:-1]:
            self.assertEqual("".join(self.engine.brf_to_unicode[c] for c in line), rows[0]["cells"])

    def test_build_unknowns_explicit_and_source_unchanged(self):
        fixtures = ROOT / "fixtures"
        fixtures.mkdir(exist_ok=True)
        source = fixtures / "mixed-source.txt"
        source_bytes = "English α β ∞ → 中文 🧿\r\nLiteral \\x0041.\r\n".encode()
        source.write_bytes(source_bytes)
        output = fixtures / "mixed-output"
        report = build(source, output, "a" * 64)
        self.assertEqual(source.read_bytes(), source_bytes)
        self.assertEqual((output / "braille-source-exact.txt").read_bytes(), source_bytes)
        self.assertEqual(report["diagnostics"]["unknown_occurrences"], 3)
        self.assertEqual(report["diagnostics"]["explicit_substitution_occurrences"], 3)
        self.assertTrue(report["diagnostics"]["line_level_unknown_check_passed"])
        self.assertTrue(report["paginated_unicode_brf_dot_equivalence"])
        substitutions = json.loads((output / "braille-substitutions.json").read_text(encoding="utf-8"))
        self.assertEqual([s["codepoint"] for s in substitutions], ["U+4E2D", "U+6587", "U+1F9FF"])
        unicode = (output / "braille-paginated-unicode.txt").read_text(encoding="utf-8")
        self.assertTrue(all(0x2800 <= ord(c) <= 0x283F or c in "\r\n\f" for c in unicode))

    def test_nul_rejected_instead_of_truncated(self):
        with self.assertRaises(ValueError):
            self.engine.translate("before\0after")


if __name__ == "__main__":
    unittest.main(verbosity=2)
