/** Deterministic, offline written encodings; no network or persistent reader state. */
export const ENCODER_VERSION = '1.0.0';
export const SOURCES = Object.freeze({
  morse: 'https://www.itu.int/dms_pubrec/itu-r/rec/m/R-REC-M.1677-1-200910-I!!PDF-E.pdf',
  nato: 'https://www.nato.int/en/about-us/nato-history/history-by-theme/symbols-of-nato/nato-phonetic-alphabet',
  natoFigures: 'https://www.nato.int/content/dam/nato/webready/news/2010-2019/2017/12/21/20180111_nato-alphabet-sign-signal.pdf',
});

// ITU-R M.1677-1, Annex 1, Part I, 1.1. Written ASCII punctuation is used
// for the corresponding punctuation classes. Other Unicode forms are escaped
// instead of being silently substituted. Multiplication × is escaped because
// the ITU signal is also X and the text could not otherwise distinguish them.
export const MORSE = Object.freeze({
  A:'.-', B:'-...', C:'-.-.', D:'-..', E:'.', F:'..-.', G:'--.',
  H:'....', I:'..', J:'.---', K:'-.-', L:'.-..', M:'--', N:'-.',
  O:'---', P:'.--.', Q:'--.-', R:'.-.', S:'...', T:'-', U:'..-',
  V:'...-', W:'.--', X:'-..-', Y:'-.--', Z:'--..',
  'É':'..-..',
  '0':'-----', '1':'.----', '2':'..---', '3':'...--', '4':'....-',
  '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.',
  '.':'.-.-.-', ',':'--..--', ':':'---...', '?':'..--..',
  "'":'.----.', '-':'-....-', '/':'-..-.', '(':'-.--.', ')':'-.--.-',
  '"':'.-..-.', '=':'-...-', '+':'.-.-.', '@':'.--.-.',
});

export const NATO = Object.freeze(Object.fromEntries([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter, index) => [letter, [
    'Alfa','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel','India',
    'Juliett','Kilo','Lima','Mike','November','Oscar','Papa','Quebec','Romeo',
    'Sierra','Tango','Uniform','Victor','Whiskey','X-ray','Yankee','Zulu',
  ][index]]),
  ...'0123456789'.split('').map((digit, index) => [digit, [
    'Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  ][index]]),
]));

export const NOTATION = Object.freeze({
  common: 'Character tokens are separated by one space. Each / token represents exactly one original ASCII space. Original LF line breaks remain line breaks. A {lc} prefix marks a lowercase letter, preserving its original case. Unsupported characters, including non-ASCII punctuation, appear as {U+XXXX} Unicode code-point tokens. These prefixes and escape tokens are edition notation, not alphabet signals. Every source text character is accounted for, and decoding this notation restores the exact extracted text.',
  morse: 'International Morse uses dots and hyphens for letters A–Z, accented É, digits, and the listed punctuation. The source slash / becomes -..-.; a bare / token is a space. Lowercase a–z and é use a {lc} prefix followed by their uppercase signals. No accent stripping, smart punctuation replacement, or other transliteration occurs. × is escaped to distinguish it from X. This is a written encoding, not timed audio or a radio transmission.',
  nato: 'NATO letters use Alfa, Juliett, and X-ray. Digits use Zero through Nine, each digit separately. All punctuation is represented by Unicode code-point tokens; it is not an invented NATO code word. Lowercase a–z use a {lc} prefix followed by their uppercase letter names.',
});

function checkText(text) {
  if (typeof text !== 'string' || !text.isWellFormed()) {
    throw new TypeError('Input must be a well-formed Unicode string');
  }
}

function alphabet(kind) {
  if (kind === 'morse') return MORSE;
  if (kind === 'nato') return NATO;
  throw new RangeError('Unknown encoding: ' + kind);
}

function fold(character, kind) {
  if (character >= 'a' && character <= 'z') return character.toUpperCase();
  if (kind === 'morse' && character === 'é') return 'É';
  return character;
}

export function unicodeToken(character) {
  if ([...character].length !== 1 || !character.isWellFormed()) {
    throw new TypeError('Expected one Unicode scalar value');
  }
  return '{U+' + character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + '}';
}

export function encode(text, kind) {
  checkText(text);
  const table = alphabet(kind);
  return text.split('\n').map(line => [...line].map(character => {
    if (character === ' ') return '/';
    const letter = fold(character, kind);
    if (Object.hasOwn(table, letter)) return (letter === character ? '' : '{lc}') + table[letter];
    return unicodeToken(character);
  }).join(' ')).join('\n');
}

export function decode(encoded, kind) {
  checkText(encoded);
  const inverse = new Map(Object.entries(alphabet(kind)).map(([key, value]) => [value, key]));
  return encoded.split('\n').map(line => {
    if (line === '') return '';
    return line.split(' ').map(token => {
      if (token === '/') return ' ';
      if (inverse.has(token)) return inverse.get(token);
      if (token.startsWith('{lc}')) {
        const letter = inverse.get(token.slice(4));
        if (letter && (/[A-Z]/.test(letter) || letter === 'É')) return letter.toLowerCase();
        throw new Error('Invalid lowercase token: ' + token);
      }
      const escape = /^\{U\+([0-9A-F]{4,6})\}$/.exec(token);
      if (!escape) throw new Error('Invalid ' + kind + ' token: ' + token);
      const codePoint = Number.parseInt(escape[1], 16);
      if (codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
        throw new Error('Invalid Unicode scalar token: ' + token);
      }
      return String.fromCodePoint(codePoint);
    }).join('');
  }).join('\n');
}

export function coverage(text, kind) {
  checkText(text);
  const table = alphabet(kind);
  const result = { encoding:kind, version:ENCODER_VERSION, inputCodePoints:0,
    alphabetTokens:0, asciiSpaces:0, lineFeeds:0, unicodeEscapeTokens:0,
    lowercaseMarkedLetters:0, escapedCodePoints:[] };
  const escaped = new Map();
  for (const character of text) {
    result.inputCodePoints++;
    if (character === '\n') result.lineFeeds++;
    else if (character === ' ') result.asciiSpaces++;
    else if (Object.hasOwn(table, fold(character, kind))) {
      result.alphabetTokens++;
      if (character !== fold(character, kind)) result.lowercaseMarkedLetters++;
    } else {
      result.unicodeEscapeTokens++;
      const token = unicodeToken(character);
      escaped.set(token, (escaped.get(token) ?? 0) + 1);
    }
  }
  result.escapedCodePoints = [...escaped].sort((a,b) => a[0].localeCompare(b[0]))
    .map(([token, count]) => ({token, count}));
  result.accountedForCodePoints = result.alphabetTokens + result.asciiSpaces + result.lineFeeds + result.unicodeEscapeTokens;
  return result;
}

export const encodeMorse = text => encode(text, 'morse');
export const encodeNato = text => encode(text, 'nato');
export const decodeMorse = text => decode(text, 'morse');
export const decodeNato = text => decode(text, 'nato');
