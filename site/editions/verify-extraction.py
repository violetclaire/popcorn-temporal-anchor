"""Independent lxml cross-check, run offline against the retained snapshot.

Usage: python verify-extraction.py canonical.html source-text.txt report.json
Requires lxml only for this optional independent audit, not for extraction/build.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
from lxml import html
from extract import extract


def sha(value):
    return hashlib.sha256(value).hexdigest()


def verify(canonical, source):
    expected, extraction = extract(canonical)
    assert source.decode('utf-8') == expected, 'Saved extraction differs from deterministic extractor'
    document = html.fromstring(canonical, parser=html.HTMLParser(encoding='utf-8'))
    bodies = document.xpath('//body')
    assert len(bodies) == 1, 'Expected exactly one canonical body'
    body = bodies[0]
    # Remove only omitted subtrees; keep their following tails in document order.
    for node in body.xpath('.//script | .//style | .//template'):
        node.drop_tree()
    pre_blocks = []
    cursor = 0
    for index, node in enumerate(body.xpath('.//pre')):
        pre = ''.join(node.itertext())
        found = expected.find(pre, cursor)
        assert found >= cursor, f'Pre block {index + 1} was changed or omitted'
        cursor = found + len(pre)
        pre_blocks.append({'index': index + 1, 'utf8_bytes': len(pre.encode('utf-8')), 'sha256': sha(pre.encode('utf-8'))})
    assert len(pre_blocks) == extraction['preBlocks']
    all_text = ''.join(body.itertext())
    remove_layout_whitespace = lambda value: re.sub(r'[\t\n\f\r ]+', '', value)
    independent_stream = remove_layout_whitespace(all_text)
    extracted_stream = remove_layout_whitespace(expected)
    assert independent_stream == extracted_stream, 'Non-whitespace body character stream differs from independent lxml parse'
    return {
        'canonical_sha256': sha(canonical), 'source_text_sha256': sha(source),
        'independent_parser': 'lxml.html.HTMLParser',
        'full_body_non_whitespace_character_stream_matches': True,
        'full_body_non_whitespace_codepoints': len(independent_stream),
        'all_preformatted_blocks_found_unchanged_in_document_order': True,
        'preformatted_blocks': pre_blocks,
        'limitations': 'Whitespace outside pre follows the documented extraction layout rules; SVG glyph outlines are not text and are not transcribed.',
    }


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: python verify-extraction.py canonical.html source-text.txt report.json')
    canonical, source, destination = map(Path, sys.argv[1:])
    report = verify(canonical.read_bytes(), source.read_bytes())
    destination.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'preformatted_blocks'}, indent=2))
    print('Unchanged preformatted blocks:', len(report['preformatted_blocks']))
