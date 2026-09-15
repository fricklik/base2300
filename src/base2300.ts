// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
import { JOYO_KANJI } from "./base2200Alphabet.js";
import { BASE2300_ALPHABET } from "./base2300Alphabet.js";

export const MAX_BASE2300_BYTES = 4 * 1024 * 1024;
const BLOCK_BITS = 244;
const BLOCK_DIGITS = 22;
const RADIX = 2300n;
const TEXT_MARKER = "あ";
const BINARY_MARKER = "ア";
const MAX_BLOCKS = Math.ceil((MAX_BASE2300_BYTES * 8 + 32) / BLOCK_BITS);
const MAX_SYMBOLS = 1 + MAX_BLOCKS * BLOCK_DIGITS;
const MAX_PACKED_BYTES = Math.ceil(MAX_BLOCKS * BLOCK_BITS / 8);
export const MAX_BASE2300_TEXT_LENGTH = MAX_SYMBOLS * 2;

const DIGIT_VALUES = new Map(BASE2300_ALPHABET.map((symbol, index) => [symbol, index]));
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function checkLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BASE2300_BYTES) {
    throw new Error("入力データは 4 MiB 以下にしてください。");
  }
}

interface SourceGroup {
  length: number;
  first: number;
  points: number[];
}

interface SourceWord {
  value: number;
  length: number;
}

/**
 * Fixed prefix code that maps characters to numbers. No example sentences, word dictionaries, or trained frequency tables are used.
 * Lowercase + digits 36 chars: 6 bit, uppercase 26 chars: 8 bit, remaining ASCII 66 chars: 11 bit.
 * Joyo kanji 2136 chars, U+3000..303F, U+3041..3096, U+30A1..30FA, totaling 2376 chars: 13 bit.
 * Each group is sorted by code point. One 13-bit ESC is appended last, followed by 21 bits representing a Unicode scalar.
 * Canonical prefix code by (code length, in-group order). Unassigned prefixes are rejected during decoding.
 * Kraft sum = 36/64 + 26/256 + 66/2048 + 2377/8192 < 1, so decoding is unambiguous.
 */
function makeSourceCodebook() {
  const lowerAndDigits = Array.from("0123456789abcdefghijklmnopqrstuvwxyz", (c) => c.codePointAt(0)!);
  const upper = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (c) => c.codePointAt(0)!);
  const alphanumeric = new Set([...lowerAndDigits, ...upper]);
  const otherAscii = Array.from({ length: 128 }, (_, index) => index).filter((point) => !alphanumeric.has(point));
  const japanese = new Set(Array.from(JOYO_KANJI, (c) => c.codePointAt(0)!));
  for (const [start, end] of [[0x3000, 0x303f], [0x3041, 0x3096], [0x30a1, 0x30fa]] as const) {
    for (let point = start; point <= end; point++) japanese.add(point);
  }
  const specifications = [
    { length: 6, points: lowerAndDigits },
    { length: 8, points: upper },
    { length: 11, points: otherAscii },
    { length: 13, points: [...japanese].sort((a, b) => a - b).concat(-1) },
  ];
  const words = new Map<number, SourceWord>();
  const groups: SourceGroup[] = [];
  let value = 0;
  let previousLength = 0;
  for (const { length, points } of specifications) {
    value *= 2 ** (length - previousLength);
    groups.push({ length, first: value, points });
    for (const point of points) words.set(point, { value: value++, length });
    previousLength = length;
  }
  if (japanese.size !== 2376 || value >= 2 ** 13) throw new Error("Base2300 v1 の入力文字表が不正です。");
  return { words, groups, escape: words.get(-1)! };
}

const SOURCE = makeSourceCodebook();

/** Converts up to 244 bits at a time to a number. Does not accumulate the whole input into a single large BigInt. */
class NumericWriter {
  private value = 1n;
  private bits = 0;
  private chunk = "";
  private chunks: string[] = [];
  symbolCount = 1;

  constructor(private readonly marker: string) {}

  append(value: number, length: number): void {
    while (length > 0) {
      const take = Math.min(length, BLOCK_BITS - this.bits);
      length -= take;
      const scale = 2 ** length;
      this.value = (this.value << BigInt(take)) | BigInt(Math.floor(value / scale));
      value %= scale;
      this.bits += take;
      if (this.bits === BLOCK_BITS) this.flush();
    }
  }

  private flush(): void {
    const digits: string[] = [];
    while (this.value > 0n) {
      digits.push(BASE2300_ALPHABET[Number(this.value % RADIX)]!);
      this.value /= RADIX;
    }
    this.symbolCount += digits.length;
    this.chunk += digits.reverse().join("");
    if (this.chunk.length >= 8192) {
      this.chunks.push(this.chunk);
      this.chunk = "";
    }
    this.value = 1n;
    this.bits = 0;
  }

  finish(checksum: number): string {
    this.append(checksum, 32);
    return this.finishWithoutChecksum();
  }

  /** For new format versions that omit CRC only. Empty data is represented by just the one-character marker. */
  finishWithoutChecksum(): string {
    if (this.bits > 0) this.flush();
    this.chunks.push(this.chunk);
    return this.marker + this.chunks.join("");
  }
}

/** Stores compressed bytes in the same base-2300 blocks; the CRC must be that of the original (decompressed) bytes. */
export function packBase2300Frame(payload: Uint8Array, marker: string, originalChecksum: number): string {
  checkLength(payload.length);
  if (marker.length !== 1 || !DIGIT_VALUES.has(marker)) throw new Error("Base2300 の識別子が不正です。");
  if (!Number.isSafeInteger(originalChecksum) || originalChecksum < 0 || originalChecksum > 0xffffffff) throw new Error("Base2300 のCRC32が不正です。");
  const writer = new NumericWriter(marker);
  for (const byte of payload) writer.append(byte, 8);
  return writer.finish(originalChecksum);
}

/**
 * Base2300 v1. The leading「あ」marker means text encoding;「ア」means raw binary; each also indicates the version.
 * Appends the CRC-32/ISO-HDLC of the original byte sequence as 32 bits at the end of the data bits.
 * Every 244 bits, a leading 1 bit is prepended to form an integer and output as base-2300 with the minimum digit count.
 * Full blocks are always 22 characters; the final block is at most 22 characters. The leading 1 preserves zero values and the exact bit length.
 * The CRC is for detecting accidental corruption only; it is not cryptographic authentication or tamper protection.
 * Compares the actual symbol count of both encodings and outputs the shorter one. If equal, binary is chosen.
 */
export function encodeBase2300(input: Uint8Array): string {
  checkLength(input.length);
  const checksum = crc32(input);
  const raw = new NumericWriter(BINARY_MARKER);
  for (const byte of input) raw.append(byte, 8);
  const binaryWire = raw.finish(checksum);

  return encodeBase2300Text(input, raw.symbolCount) ?? binaryWire;
}

/** New frame formats may change rankings, so the legacy binary encoding is also available independently. */
export function encodeBase2300Binary(input: Uint8Array): string {
  checkLength(input.length);
  const writer = new NumericWriter(BINARY_MARKER);
  for (const byte of input) writer.append(byte, 8);
  return writer.finish(crc32(input));
}

/** Tries the character-type model independently. When omitted, only the format's upper limit applies. */
export function encodeBase2300Text(input: Uint8Array, maximumCharacters = MAX_SYMBOLS + 1): string | null {
  checkLength(input.length);
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 0) throw new Error("Base2300 の文字数上限が不正です。");
  const limit = Math.min(maximumCharacters, MAX_SYMBOLS + 1);
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
  } catch {
    return null;
  }
  const source = new NumericWriter(TEXT_MARKER);
  for (const character of decoded) {
    const point = character.codePointAt(0)!;
    const word = SOURCE.words.get(point);
    if (word !== undefined) source.append(word.value, word.length);
    else {
      source.append(SOURCE.escape.value, SOURCE.escape.length);
      source.append(point, 21);
    }
    if (source.symbolCount >= limit) return null;
  }
  const textWire = source.finish(crc32(input));
  return source.symbolCount < limit ? textWire : null;
}

export function getBase2300Mode(text: string): "text" | "binary" {
  if (text.startsWith(TEXT_MARKER)) return "text";
  if (text.startsWith(BINARY_MARKER)) return "binary";
  throw new Error("Base2300 v1 の形式ではありません。");
}

class ByteWriter {
  private bytes: Uint8Array;
  length = 0;

  constructor(private readonly maximum: number, initial = 128) {
    this.bytes = new Uint8Array(Math.min(initial, maximum));
  }

  append(byte: number): void {
    if (this.length === this.maximum) throw new Error("Base2300 の復元結果が上限 4 MiB を超えています。");
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(Math.min(this.maximum, Math.max(128, this.bytes.length * 2)));
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = byte;
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/** Repacks numeric blocks into a byte array. Unused low bits in the final byte are set to 0. */
function unpack(text: string): { bytes: Uint8Array; bitLength: number } {
  const packed = new ByteWriter(MAX_PACKED_BYTES);
  let pending = 0;
  let pendingBits = 0;
  let totalBits = 0;
  let value = 0n;
  let digits = 0;
  let symbolCount = 1;

  const flush = (last: boolean): void => {
    if (value < 2n) throw new Error("Base2300 の数値ブロックが不正です。");
    let bits = value.toString(2).length - 1;
    if (bits > BLOCK_BITS || (!last && bits !== BLOCK_BITS)) {
      throw new Error("Base2300 の数値ブロックのビット数が不正です。");
    }
    value ^= 1n << BigInt(bits);
    totalBits += bits;
    while (bits > 0) {
      const take = Math.min(24, bits);
      bits -= take;
      const part = Number((value >> BigInt(bits)) & ((1n << BigInt(take)) - 1n));
      pending = pending * 2 ** take + part;
      pendingBits += take;
      while (pendingBits >= 8) {
        pendingBits -= 8;
        packed.append((pending >>> pendingBits) & 255);
        pending &= 2 ** pendingBits - 1;
      }
    }
    value = 0n;
    digits = 0;
  };

  for (const symbol of text.slice(1)) {
    if (++symbolCount > MAX_SYMBOLS) throw new Error("Base2300 の入力が長すぎます（復元上限 4 MiB）。");
    if (digits === BLOCK_DIGITS) flush(false);
    const digit = DIGIT_VALUES.get(symbol);
    if (digit === undefined) throw new Error("Base2300 で使用しない文字があります。空白や異体字も区別されます。");
    if (digits === 0 && digit === 0) throw new Error("Base2300 の数値に余分な先頭ゼロがあります。");
    value = value * RADIX + BigInt(digit);
    digits++;
  }
  if (digits === 0) throw new Error("Base2300 のデータがありません。");
  flush(true);
  if (pendingBits > 0) packed.append(pending * 2 ** (8 - pendingBits));
  return { bytes: packed.finish(), bitLength: totalBits };
}

class BitReader {
  position = 0;

  constructor(private readonly bytes: Uint8Array, readonly length: number) {}

  read(length: number): number {
    if (length > this.length - this.position) throw new Error("Base2300 の数値データが途中で終わっています。");
    let value = 0;
    while (length > 0) {
      const offset = this.position & 7;
      const take = Math.min(length, 8 - offset);
      value = value * 2 ** take + ((this.bytes[this.position >>> 3]! >>> (8 - offset - take)) & (2 ** take - 1));
      this.position += take;
      length -= take;
    }
    return value;
  }
}

/** Validates the frame before decompression. CRC verification is performed after the original bytes are restored. */
export function unpackBase2300Frame(text: string): { payload: Uint8Array; checksum: number } {
  if (text.length > MAX_BASE2300_TEXT_LENGTH) throw new Error("Base2300 の入力が長すぎます（復元上限 4 MiB）。");
  const packed = unpack(text);
  const dataBits = packed.bitLength - 32;
  if (dataBits < 0 || dataBits % 8 !== 0) throw new Error("Base2300 の圧縮フレームのビット数が不正です。");
  checkLength(dataBits / 8);
  const reader = new BitReader(packed.bytes, packed.bitLength);
  reader.position = dataBits;
  return { payload: packed.bytes.slice(0, dataBits / 8), checksum: reader.read(32) };
}

function appendScalar(writer: ByteWriter, point: number): void {
  if (point <= 0x7f) writer.append(point);
  else if (point <= 0x7ff) {
    writer.append(0xc0 | (point >>> 6));
    writer.append(0x80 | (point & 63));
  } else if (point <= 0xffff) {
    writer.append(0xe0 | (point >>> 12));
    writer.append(0x80 | ((point >>> 6) & 63));
    writer.append(0x80 | (point & 63));
  } else {
    writer.append(0xf0 | (point >>> 18));
    writer.append(0x80 | ((point >>> 12) & 63));
    writer.append(0x80 | ((point >>> 6) & 63));
    writer.append(0x80 | (point & 63));
  }
}

/** Omitting CRC is only for internally expanding the minimal format. Normally decoding is strict and includes CRC verification. */
export function decodeBase2300(text: string, verifyChecksum = true): Uint8Array {
  if (text.length > MAX_BASE2300_TEXT_LENGTH) throw new Error("Base2300 の入力が長すぎます（復元上限 4 MiB）。");
  const mode = getBase2300Mode(text);
  const packed = unpack(text);
  if (packed.bitLength < 32) throw new Error("Base2300 のチェックサムが不足しています。");
  const dataBits = packed.bitLength - 32;
  const reader = new BitReader(packed.bytes, dataBits);
  let bytes: Uint8Array;
  if (mode === "binary") {
    if (dataBits % 8 !== 0) throw new Error("Base2300 のバイナリのビット数が不正です。");
    checkLength(dataBits / 8);
    bytes = packed.bytes.slice(0, dataBits / 8);
  } else {
    const writer = new ByteWriter(MAX_BASE2300_BYTES);
    while (reader.position < dataBits) {
      let value = 0;
      let previousLength = 0;
      let point: number | undefined;
      for (const group of SOURCE.groups) {
        const take = group.length - previousLength;
        value = value * 2 ** take + reader.read(take);
        const index = value - group.first;
        if (index >= 0 && index < group.points.length) {
          point = group.points[index]!;
          break;
        }
        previousLength = group.length;
      }
      if (point === undefined) throw new Error("Base2300 の入力文字コードが未割当です。");
      if (point === -1) {
        point = reader.read(21);
        if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
          throw new Error("Base2300 に不正な Unicode コードポイントがあります。");
        }
        if (SOURCE.words.has(point)) throw new Error("Base2300 に不要な Unicode エスケープがあります。");
      }
      appendScalar(writer, point);
    }
    bytes = writer.finish();
  }
  const checksumReader = new BitReader(packed.bytes, packed.bitLength);
  checksumReader.position = dataBits;
  const expectedChecksum = checksumReader.read(32);
  if (verifyChecksum && crc32(bytes) !== expectedChecksum) throw new Error("チェックサムが一致しません。Base2300 の文字列が変わっている可能性があります。");
  return bytes;
}

// Reuses the same fixed-length block and bounded-restoration logic across per-version character models.
export {
  NumericWriter as Base2300BitWriter,
  BitReader as Base2300BitReader,
  ByteWriter as BoundedByteWriter,
  unpack as unpackBase2300Bits,
  appendScalar,
};
