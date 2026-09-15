import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  encode, decode, encodeText, decodeText, encodeBase2300Text, encodeBase2300Binary,
  BASE2300_ALPHABET as alphabet, MAX_BASE2300_BYTES, MAX_BASE2300_TEXT_LENGTH, measureText, crc32,
  BASE64_ALPHABET, JOYO_KANJI, BASE2200_ALPHABET, BASE2300_HIRAGANA, BASE2300_KATAKANA,
} from '../dist/index.js';

const utf8 = (text) => new TextEncoder().encode(text);
const bytes = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'));
const same = (actual, expected) => assert.deepEqual(Uint8Array.from(actual), Uint8Array.from(expected));

// Retained upstream vectors were generated with independent Python integer arithmetic and zlib.crc32.
// The English sentence vector was cross-checked the same way (Python canonical prefix code + big-int radix conversion).
const vectors = [
  ['', 'ア憶隅債'],
  ['00', 'ア九糧孔姿'],
  ['ff', 'ア倫草塾圧'],
  ['313233343536373839', 'あ内隊葉抜宅科諮獲'],
  ['666f6f', 'あx陽栽粋起'],
  ['000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'ア彙士癖隠頂把裾雰鈍粗勃航記請巧球茶益耳肢夫魂B嚇垂ンm'],
  ['4261736532333030207061636b73207468652073616d6520627974657320696e746f20666577657220636861726163746572732e', 'あ殻律注架霊慮彫需仕林爽模製兆氏9帝否い壁燃克夢浄備餓計麗蹴香懐叔汰体桜'],
  ['616263616263616263616263616263616263616263616263616263616263efbbbf0d0a65cc81f09f91a9e2808df09f92bbf0a0ae9f', 'あ手体鈍是鍵逮艇損雰寂都仰倫輪旬コ賭宙歳貧ゔ孤C暖拳婆舞摘旅塩L求馬踏兵双禍勘仁'],
];

test('alphabet order, uniqueness, normalization and CRC32 are fixed', () => {
  assert.equal(alphabet.length, 2300);
  assert.equal(new Set(alphabet).size, 2300);
  assert.equal(createHash('sha256').update(alphabet.join('')).digest('hex'), '3161548944eb8347658152a30e41677efe91342755ff8ebdfbcf5151dc1371cf');
  for (const form of ['NFC', 'NFKC']) assert.equal(alphabet.join('').normalize(form), alphabet.join(''));
  assert.equal(crc32(utf8('123456789')), 0xcbf43926);
});

test('encode accepts Uint8Array values created in another realm', async () => {
  const { runInNewContext } = await import('node:vm');
  const foreign = runInNewContext('new Uint8Array([0x66, 0x6f, 0x6f])');
  assert.equal(foreign instanceof Uint8Array, false);
  assert.equal(encode(foreign), 'あx陽栽粋起');
  assert.throws(() => encode('foo'), TypeError);
  assert.throws(() => encode(new Uint16Array(2)), TypeError);
});

test('alphabet building blocks are exported and compose the fixed alphabet', () => {
  assert.equal(BASE64_ALPHABET.length, 64);
  assert.equal([...JOYO_KANJI].length, 2136);
  assert.equal(BASE2200_ALPHABET.length, 2200);
  assert.deepEqual([...BASE2200_ALPHABET], [...BASE64_ALPHABET, ...JOYO_KANJI]);
  assert.deepEqual([...alphabet], [...BASE2200_ALPHABET, ...BASE2300_HIRAGANA, ...BASE2300_KATAKANA]);
  assert.ok(Object.isFrozen(BASE2200_ALPHABET));
});

for (const [hex, wire] of vectors) test(`independent checked vector ${hex || '(empty)'}`, () => {
  assert.equal(encode(bytes(hex)), wire);
  same(decode(wire), bytes(hex));
});

test('all byte values and block/tail boundaries round-trip', () => {
  for (let value = 0; value < 256; value++) same(decode(encode(Uint8Array.of(value))), Uint8Array.of(value));
  for (let length = 0; length <= 125; length++) {
    for (const input of [new Uint8Array(length), new Uint8Array(length).fill(255), Uint8Array.from({ length }, (_, i) => (i * 73) ^ (i >> 5) ^ length)]) {
      same(decode(encode(input)), input);
    }
  }
});

test('UTF-8, BOM, supplementary symbols, combining sequences and control bytes stay exact', () => {
  const text = '\ufeff' + 'abc'.repeat(40) + '\0\r\n e\u0301 👩‍💻 𠮟 \u{10ffff}';
  assert.equal(decodeText(encodeText(text)), text);
  const view = bytes('aabbefbbbf80c0ff000a0dccdd').subarray(2, 11);
  same(decode(encode(view)), view);
  assert.equal(encodeBase2300Text(view), null);
  assert.throws(() => decodeText(encode(view)));
  for (const malformed of ['\ud800', '\udfff', 'x\ud800x', '\ud800\ud800']) assert.throws(() => encodeText(malformed), /surrogate/);
  assert.throws(() => encode('text'), TypeError);
  assert.throws(() => decode(new Uint8Array()), TypeError);
});

test('character count differs from bytes and UTF-16 units', () => {
  assert.deepEqual(measureText('A𠮟e\u0301'), { codePoints: 4, utf16Units: 5, utf8Bytes: 8 });
  const text = 'Base2300 packs the same bytes into fewer characters.';
  assert.deepEqual(measureText(text), { codePoints: 52, utf16Units: 52, utf8Bytes: 52 });
  assert.deepEqual(measureText(encodeText(text)), { codePoints: 36, utf16Units: 36, utf8Bytes: 106 });
  const japanese = '吾輩は猫である。';
  assert.deepEqual(measureText(japanese), { codePoints: 8, utf16Units: 8, utf8Bytes: 24 });
});

test('64 KiB independent output hash is retained', () => {
  const input = Uint8Array.from({ length: 65536 }, (_, i) => (i * 73) ^ (i >> 5) ^ (i >> 11));
  const wire = encode(input);
  assert.equal(createHash('sha256').update(wire).digest('hex'), 'be40c7185d325c8d64c7c884c027d2fc6224d64ab3399008afd82f2527143e43');
  assert.equal(measureText(wire).codePoints, 47276);
  same(decode(wire), input);
});

test('maximum 4 MiB binary round-trip and early limit rejection', { timeout: 60000 }, () => {
  let seed = 0xa5be8713;
  const input = Uint8Array.from({ length: MAX_BASE2300_BYTES }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  });
  same(decode(encodeBase2300Binary(input)), input);
  assert.throws(() => encode(new Uint8Array(MAX_BASE2300_BYTES + 1)), /4 MiB/);
  assert.throws(() => decode('A'.repeat(MAX_BASE2300_TEXT_LENGTH + 1)), /長すぎ/);
});

// Make malformed numerical blocks independently from the production bit writer.
function wireBits(marker, bits) {
  let wire = marker;
  for (let i = 0; i < bits.length; i += 244) {
    let value = BigInt(`0b1${bits.slice(i, i + 244)}`);
    let digits = '';
    while (value) { digits = alphabet[Number(value % 2300n)] + digits; value /= 2300n; }
    wire += digits;
  }
  return wire;
}

test('malformed frames, truncation, Unicode scalar errors and CRC corruption are rejected', () => {
  for (const wire of ['', 'A', 'あ', 'ア', ' あ憶隅債', '\ufeffア憶隅債', 'ア憶隅債\n', 'ア😀', 'ア\ud840', 'アA', 'アB', 'アA憶隅債']) {
    assert.throws(() => decode(wire));
  }
  assert.throws(() => decode(wireBits('ア', '0'.repeat(31))), /チェックサム/);
  assert.throws(() => decode(wireBits('ア', '0'.repeat(33))), /ビット数/);
  assert.throws(() => decode('ア' + alphabet[2299].repeat(22)), /ビット数/);
  const checksum = '0'.repeat(32);
  const escape = '1111110010000';
  assert.throws(() => decode(wireBits('あ', '1'.repeat(13) + checksum)), /未割当/);
  assert.throws(() => decode(wireBits('あ', '00000' + checksum)), /途中/);
  for (const scalar of [0xd800, 0xdfff, 0x110000, 0x1fffff]) {
    assert.throws(() => decode(wireBits('あ', escape + scalar.toString(2).padStart(21, '0') + checksum)), /コードポイント/);
  }
  assert.throws(() => decode(wireBits('あ', escape + (97).toString(2).padStart(21, '0') + checksum)), /不要/);
  const badCrc = wireBits('ア', '0'.repeat(31) + '1');
  assert.throws(() => decode(badCrc), /チェックサム/);
  // Extra arguments cannot disable the public stable API's integrity check.
  assert.throws(() => decode(badCrc, false), /チェックサム/);
  const wire = encodeText('Base2300 packs the same bytes into fewer characters.');
  assert.throws(() => decode(wire.slice(0, -1) + '終'));
  assert.throws(() => decode(wire + wireBits('', checksum)));
});
