import test from 'node:test';
import assert from 'node:assert/strict';
import { MORSE, NATO, encode, decode, coverage } from './encoders.mjs';

test('International Morse letters, figures and supported punctuation match ITU table', () => {
  assert.equal(encode('SOS 767-2676.com', 'morse'), '... --- ... / --... -.... --... -....- ..--- -.... --... -.... .-.-.- {lc}-.-. {lc}--- {lc}--');
  assert.equal(encode('É.,:?\'-/()"=+@', 'morse'), '..-.. .-.-.- --..-- ---... ..--.. .----. -....- -..-. -.--. -.--.- .-..-. -...- .-.-. .--.-.');
  assert.equal(Object.keys(MORSE).length, 50);
  assert.equal(new Set(Object.values(MORSE)).size, Object.keys(MORSE).length);
});

test('NATO exact spellings, digits individually and punctuation explicit', () => {
  assert.equal(encode('AJX 90!', 'nato'), 'Alfa Juliett X-ray / Nine Zero {U+0021}');
  assert.equal(encode('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'nato'), 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu');
  assert.equal(encode('leTAIN', 'nato'), '{lc}Lima {lc}Echo Tango Alfa India November');
  assert.equal(new Set(Object.values(NATO)).size, 36);
});

test('word breaks, lines, tabs and source punctuation cannot collide with delimiters', () => {
  const source = ' A  B/\n\n\tC\r\n{U+0041} \\ ';
  for (const kind of ['morse','nato']) {
    const encoded = encode(source, kind);
    assert.equal(decode(encoded, kind), source);
    assert.equal(encoded.split('\n').length, source.split('\n').length);
    assert.ok(encoded.includes('{U+007B}'));
    assert.ok(encoded.includes('{U+0009}'));
    assert.ok(encoded.includes('{U+000D}'));
  }
  assert.equal(encode('/', 'morse'), '-..-.');
  assert.equal(encode('/', 'nato'), '{U+002F}');
});

test('unsupported characters remain distinguishable; no accent, punctuation or ligature stripping', () => {
  const source = 'leTAIN “éèßﬁ×—…” 中 🪞\u00A0\u200B\u200D\u0301';
  for (const kind of ['morse','nato']) {
    assert.equal(decode(encode(source, kind), kind), source);
    const report = coverage(source, kind);
    assert.equal(report.inputCodePoints, [...source].length);
    assert.equal(report.accountedForCodePoints, report.inputCodePoints);
    assert.ok(report.escapedCodePoints.some(item => item.token === '{U+00DF}'));
    assert.ok(report.escapedCodePoints.some(item => item.token === '{U+00D7}'));
    assert.ok(report.escapedCodePoints.some(item => item.token === '{U+1FA9E}'));
  }
});

test('roundtrip all ASCII and representative supplementary Unicode values', () => {
  const source = Array.from({length:128}, (_,i) => String.fromCodePoint(i)).join('') + '\u00E9\u00C9\u4E00\u{10000}\u{10FFFF}';
  for (const kind of ['morse','nato']) {
    assert.equal(decode(encode(source, kind), kind), source);
    assert.equal(coverage(source, kind).accountedForCodePoints, [...source].length);
  }
});

test('empty documents supported; malformed inputs and invalid tokens rejected', () => {
  for (const kind of ['morse','nato']) {
    assert.equal(encode('', kind), '');
    assert.equal(decode('', kind), '');
    assert.throws(() => encode('\uD800', kind), TypeError);
    assert.throws(() => decode('{U+D800}', kind));
    assert.throws(() => decode('{U+110000}', kind));
    assert.throws(() => decode('{lc}{U+0041}', kind));
    assert.throws(() => decode('  ', kind));
  }
  assert.throws(() => encode('A', 'made-up'), RangeError);
});
