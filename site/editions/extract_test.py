import unittest
from extract import extract


class ExtractionTests(unittest.TestCase):
    def test_inline_flow_is_not_joined_or_split_incorrectly(self):
        text, _ = extract(b'<html><head><title>Head ignored</title></head><body><p>Hello <em>brave</em> world &amp; friends.</p><p>Second<br>line.</p></body></html>')
        self.assertEqual(text, 'Hello brave world & friends.\nSecond\nline.\n')

    def test_pre_keeps_whitespace_and_literal_tags(self):
        raw = b'<html><body><p>Code:</p><pre>\n  a\t b\r\n &lt;script&gt;literal&lt;/script&gt;\n\n</pre><p>After</p></body></html>'
        text, report = extract(raw)
        self.assertIn('\n  a\t b\n <script>literal</script>\n\n', text)
        self.assertEqual(report['preBlocks'], 1)
        self.assertEqual(report['canonicalByteLength'], len(raw))

    def test_script_css_template_and_comments_are_excluded(self):
        text, _ = extract(b'<body>Keep<script>throw 1</script><style>CSS</style><template><p>Hidden</p></template><!-- Comment --> this.</body>')
        self.assertEqual(text, 'Keep this.')

    def test_svg_title_and_text_remain_paths_flagged(self):
        text, report = extract(b'<body><svg><title>leTAIN</title><path d="hidden"/><use href="#a"/></svg><p aria-label="Supplemental">Visible</p></body>')
        self.assertEqual(text, 'leTAIN\nVisible\n')
        self.assertEqual(report['svgTitles'], ['leTAIN'])
        self.assertEqual(report['svgPathElements'], 1)
        self.assertEqual(report['ariaLabels'][0]['text'], 'Supplemental')
        self.assertTrue(any('no transcript' in note for note in report['limitations']))


if __name__ == '__main__':
    unittest.main()
