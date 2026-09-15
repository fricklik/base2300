import { gzipSync } from 'node:zlib';

const utf8 = (text) => new TextEncoder().encode(text);

/** Reproducible synthetic bytes, NOT a cryptographic generator. */
export function seededBytes(length, seed = 0x2300cafe) {
  let state = seed >>> 0;
  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 255;
  });
}

// Original, synthetic examples: no external corpus, private data, or downloads.
export function makeCorpus() {
  const text = (id, value, description) => ({ id, bytes: utf8(value), description });
  const random = seededBytes(4096);
  const records = JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
    id: index, enabled: index % 3 === 0, name: `観測-${index}`, reading: index * 17 + 3,
  })));
  return [
    text('empty', '', 'Empty input; framing cost is visible.'),
    text('one-ascii', 'A', 'One ASCII byte; framing dominates.'),
    text('short-english', 'Hello, world!', 'Short English greeting.'),
    text('short-japanese', 'こんにちは、世界。', 'Short Japanese greeting.'),
    text('japanese-prose', '文字数を減らす実験です。保存するバイト数とは別に、文字の数え方と復元できる条件を確かめます。', 'Original Japanese prose.'),
    text('english-prose', 'This experiment counts characters. The encoded text can become shorter while its UTF-8 representation becomes larger.', 'Original English prose.'),
    text('printable-ascii', Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join(''), 'Every printable ASCII character once.'),
    text('digits', Array.from(seededBytes(160, 0xdecafbad), (byte) => String(byte % 10)).join(''), '160 synthetic digits; modest statistical redundancy.'),
    text('emoji', '🙂🚀🍵👩🏽‍💻👨‍👩‍👧‍👦🇯🇵❤️🏳️‍🌈', 'Emoji, skin tone, ZWJ, flags, and variation selectors.'),
    text('combining', 'e\u0301 a\u0308 か\u3099 は\u309a A\u030a n\u0303', 'Decomposed accents and kana; preserve exact bytes.'),
    text('multilingual', '你好，世界。안녕하세요. مرحبا بالعالم. नमस्ते दुनिया। 𠮟る。', 'Mixed scripts, combining sequences, and supplementary CJK.'),
    text('utf8-bom', '\ufeffKeep this byte-order mark.', 'A UTF-8 BOM is data and must survive the round trip.'),
    text('json-records', records, 'Structured, repetitive JSON records.'),
    text('repeated-ascii', 'abc123 '.repeat(1024), '7 KiB of highly compressible ASCII; deliberately favorable to compressors.'),
    text('repeated-japanese', '文字数の実験。'.repeat(256), 'Highly repetitive Japanese; deliberately favorable to compressors.'),
    { id: 'binary-32', bytes: seededBytes(32, 0x12345678), description: 'Synthetic 32-byte binary value.' },
    { id: 'all-byte-values', bytes: Uint8Array.from({ length: 256 }, (_, index) => index), description: 'Every byte value once; invalid UTF-8.' },
    { id: 'invalid-utf8', bytes: Uint8Array.of(0xff, 0xfe, 0xc0, 0xaf, 0xed, 0xa0, 0x80, 0x00), description: 'Malformed UTF-8 and a NUL; bytes remain exact.' },
    { id: 'random-4096', bytes: random, description: '4096 seeded pseudo-random bytes; not a cryptographic or entropy proof.' },
    { id: 'already-gzip', bytes: new Uint8Array(gzipSync(random, { level: 9, mtime: 0 })), description: 'Already-compressed seeded random bytes; gzip level 9, mtime 0.' },
  ];
}
