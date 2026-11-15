"""Extract canonical body character data without executing or fetching anything.

Usage: python extract.py canonical.html source-text.txt extraction.json
The digest is always of the original HTML bytes, before parsing/newline handling.
"""
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import re
import sys

VERSION = '1.0.0'
BLOCKS = set('address article aside blockquote caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p section summary table tbody tfoot thead tr ul title desc'.split())
OMIT = {'script', 'style', 'template'}
VOIDS = set('area base br col embed hr img input link meta param source track wbr'.split())
SPACE = re.compile(r'[\t\n\f\r ]+')


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_body = False
        self.stack = []
        self.pre_depth = 0
        self.omit_depth = 0
        self.svg_depth = 0
        self.parts = []
        self.report = {
            'extractionVersion': VERSION,
            'bodyTextNodes': 0, 'preBlocks': 0, 'preCharacters': 0,
            'svgElements': 0, 'svgPathElements': 0, 'svgUseElements': 0,
            'svgTextElements': 0, 'svgTitles': [], 'ariaLabels': [],
            'imageAltTexts': [], 'explicitlyHiddenElements': [],
            'omittedElementCounts': {},
        }
        self.svg_title_depth = 0

    def boundary(self):
        # Structural whitespace is separate from canonical text nodes.
        # Never trim or rewrite the contents of a preformatted block.
        if not self.parts or self.parts[-1] == '\n':
            return
        self.parts.append('\n')

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'body':
            self.in_body = True
        if not self.in_body:
            return
        if self.omit_depth:
            if tag not in VOIDS:
                self.omit_depth += 1
            return
        if tag in OMIT:
            self.report['omittedElementCounts'][tag] = self.report['omittedElementCounts'].get(tag, 0) + 1
            self.omit_depth = 1
            return
        if 'aria-label' in attrs:
            self.report['ariaLabels'].append({'tag': tag, 'id': attrs.get('id'), 'text': attrs['aria-label']})
        if 'hidden' in attrs:
            self.report['explicitlyHiddenElements'].append({'tag': tag, 'id': attrs.get('id')})
        if tag == 'img' and attrs.get('alt'):
            self.report['imageAltTexts'].append(attrs['alt'])
        if tag == 'svg':
            self.svg_depth += 1
            self.report['svgElements'] += 1
            self.boundary()
        if self.svg_depth:
            if tag == 'path':
                self.report['svgPathElements'] += 1
            if tag == 'use':
                self.report['svgUseElements'] += 1
            if tag == 'text':
                self.report['svgTextElements'] += 1
            if tag == 'title':
                self.svg_title_depth += 1
        if not self.pre_depth and (tag in BLOCKS or tag in {'br', 'pre', 'text'}):
            self.boundary()
        if tag == 'pre':
            self.pre_depth += 1
            self.report['preBlocks'] += 1
        if tag not in VOIDS:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOIDS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if not self.in_body:
            return
        if self.omit_depth:
            self.omit_depth -= 1
            return
        if tag == 'pre':
            self.pre_depth = max(0, self.pre_depth - 1)
        if not self.pre_depth and (tag in BLOCKS or tag in {'pre', 'text', 'svg'}):
            self.boundary()
        if tag in {'td', 'th'} and not self.pre_depth:
            self.parts.append('\t')
        if tag == 'title' and self.svg_title_depth:
            self.svg_title_depth -= 1
        if tag == 'svg':
            self.svg_depth = max(0, self.svg_depth - 1)
        if tag in self.stack:
            del self.stack[len(self.stack) - 1 - self.stack[::-1].index(tag):]
        if tag == 'body':
            self.in_body = False

    def handle_data(self, data):
        if not self.in_body or self.omit_depth:
            return
        self.report['bodyTextNodes'] += 1
        if self.svg_title_depth and data.strip():
            self.report['svgTitles'].append(data)
        if self.pre_depth:
            self.report['preCharacters'] += len(data)
            self.parts.append(data)
            return
        data = SPACE.sub(' ', data)
        if not self.parts or self.parts[-1].endswith((' ', '\n', '\t')):
            data = data.lstrip(' ')
        if data:
            self.parts.append(data)

    def result(self):
        # Strip only whitespace caused by source indentation outside blocks;
        # no global strip/rstrip operation can damage preformatted contents.
        return ''.join(self.parts)


def extract(raw):
    decoded = raw.decode('utf-8', errors='strict')
    # HTML input preprocessing normalizes CRLF and lone CR to LF.
    normalized = decoded.replace('\r\n', '\n').replace('\r', '\n')
    parser = TextExtractor()
    parser.feed(normalized)
    parser.close()
    text = parser.result()
    parser.report.update({
        'canonicalByteLength': len(raw),
        'canonicalSha256': hashlib.sha256(raw).hexdigest(),
        'sourceTextUtf8ByteLength': len(text.encode('utf-8')),
        'sourceTextCodePoints': len(text),
        'sourceTextSha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
        'rules': [
            'Decode canonical bytes as strict UTF-8; canonical digest is calculated before any parsing.',
            'Normalize HTML CRLF and CR to LF, decode HTML character references, include body character data in document order.',
            'Omit script, style and template contents, comments, attributes and head metadata.',
            'Collapse ASCII whitespace outside pre, insert LF at block boundaries and TAB after table cells.',
            'Preserve all preformatted character data, including source code, payloads, archived documents and whitespace.',
            'Include actual SVG title, desc and text character data; do not invent text from glyph outlines.',
            'Record aria-label and image alt attributes separately in this report; do not inject editor prose into source text.',
        ],
        'limitations': [
            'This is deterministic text extraction, not a byte-for-byte copy of HTML markup and not a browser accessibility tree.',
            'CSS-generated labels, graphical layout and words converted to SVG paths are not text nodes and are not transcribed.',
        ],
    })
    if parser.report['svgPathElements'] and not parser.report['svgTextElements']:
        parser.report['limitations'].append('The canonical mirror SVG contains glyph outlines and a title but no selectable SVG text; graphical words have no transcript in this edition.')
    return text, parser.report


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: python extract.py canonical.html source-text.txt extraction.json')
    source, text_path, report_path = map(Path, sys.argv[1:])
    text, report = extract(source.read_bytes())
    text_path.write_bytes(text.encode('utf-8'))
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(report, indent=2, ensure_ascii=False))
