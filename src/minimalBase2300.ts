// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
import {
  Base2300BitReader,
  Base2300BitWriter,
  MAX_BASE2300_BYTES,
  MAX_BASE2300_TEXT_LENGTH,
  unpackBase2300Bits,
} from "./base2300.js";
import { BASE2300_ALPHABET } from "./base2300Alphabet.js";

// Mode order is fixed per version. The 8th entry「き」is LLM predictive compression (exclusive to this terminal's daemon).
const MODES = ["あ", "ア", "お", "か", "い", "う", "え", "き"] as const;
const BLOCK_BITS = 244;
const BLOCK_DIGITS = 22;
const RADIX = 2300n;
const MAX_SYMBOLS = MAX_BASE2300_TEXT_LENGTH / 2;
const MAX_EXPANDED_BITS = (MAX_SYMBOLS - 1) / BLOCK_DIGITS * BLOCK_BITS;
const DIGITS = new Map(BASE2300_ALPHABET.map((symbol, index) => [symbol, index]));

/**
 * CRC-free Base2300 v1. The leading Joyo kanji stores the mode and the bit length of the final block.
 * header = alphabet[64 + modeIndex*245 + tailBits]; mode order is あ/ア/お/か/い/う/え/き.
 * tailBits=0 is reserved for empty data; non-empty uses 1..244. All 1960 header variants are BMP Joyo kanji.
 * The body uses no leading sentinel; 244 bits → 22 digits, tail b bits → ceil(log_2300(2^b)) digits.
 * Integers shorter than the fixed digit count are left-padded with alphabet[0] ('A'), preserving leading zeros.
 * Changing the character table, mode order, or numeric structure requires a version change.
 * The original data is fully recoverable, but omitting the CRC means some transcription errors or corruption may go undetected.
 */
const HEADERS = new Map(
  BASE2300_ALPHABET.slice(64, 64 + MODES.length * 245).map((symbol, index) => [symbol, index]),
);

// Computes the minimum fixed digit count to represent 2^b using integer arithmetic, without relying on floating-point rounding.
const DIGITS_PER_BITS = Array.from({ length: BLOCK_BITS + 1 }, (_, bits) => {
  let capacity = 1n;
  let digits = 0;
  while (capacity < (1n << BigInt(bits))) {
    capacity *= RADIX;
    digits++;
  }
  return digits;
});

function checkWireLength(wire: string): void {
  if (wire.length > MAX_BASE2300_TEXT_LENGTH) throw new Error("Base2300 の入力が長すぎます（復元上限 4 MiB）。");
}

function writeValue(value: bigint, bits: number, writer: Base2300BitWriter): void {
  while (bits > 0) {
    const take = Math.min(24, bits);
    bits -= take;
    const part = Number((value >> BigInt(bits)) & ((1n << BigInt(take)) - 1n));
    writer.append(part, take);
  }
}

/** Identifies the header only; structural validation is performed by expand and each internal decoder. */
export function isMinimalBase2300(text: string): boolean {
  return HEADERS.has(text.charAt(0));
}

/** Computes the total code-point count of all output using fixed-width digit counts, without actually converting to numeric values. */
export function countMinimalBase2300Characters(dataBits: number): number {
  if (!Number.isSafeInteger(dataBits) || dataBits < 0 || dataBits > MAX_EXPANDED_BITS - 32) {
    throw new Error("Base2300 のデータのビット数が不正です。");
  }
  return 1 + Math.floor(dataBits / BLOCK_BITS) * BLOCK_DIGITS + DIGITS_PER_BITS[dataBits % BLOCK_BITS]!;
}

/** Stores a byte payload directly in the existing CRC-free format, skipping the round-trip through the CRC-bearing format. */
export function packMinimalBase2300Frame(payload: Uint8Array, marker: string): string {
  if (payload.length > MAX_BASE2300_BYTES) throw new Error("入力データは 4 MiB 以下にしてください。");
  const mode = MODES.findIndex((candidate) => candidate === marker);
  if (mode === -1) throw new Error("未対応のCRCなしBase2300形式です。");
  return packMinimalBits(payload, payload.length * 8, mode);
}

/** Removes the trailing 32 bits of a CRC-bearing frame. Does not verify the internal codec or CRC itself; preserves the data bits. */
export function minimizeBase2300Frame(checkedWire: string): string {
  checkWireLength(checkedWire);
  const mode = MODES.findIndex((marker) => marker === checkedWire.charAt(0));
  if (mode === -1) throw new Error("未対応のCRC付きBase2300形式です。");
  const packed = unpackBase2300Bits(checkedWire);
  if (packed.bitLength < 32) throw new Error("Base2300 のチェックサムが不足しています。");
  const dataBits = packed.bitLength - 32;
  return packMinimalBits(packed.bytes, dataBits, mode);
}

function packMinimalBits(bytes: Uint8Array, dataBits: number, mode: number): string {
  const tail = dataBits === 0 ? 0 : (dataBits - 1) % BLOCK_BITS + 1;
  const header = BASE2300_ALPHABET[64 + mode * 245 + tail]!;
  const reader = new Base2300BitReader(bytes, dataBits);
  const chunks: string[] = [];
  let chunk = "";
  while (reader.position < dataBits) {
    const bits = Math.min(BLOCK_BITS, dataBits - reader.position);
    let remaining = bits;
    let value = 0n;
    while (remaining > 0) {
      const take = Math.min(24, remaining);
      value = (value << BigInt(take)) | BigInt(reader.read(take));
      remaining -= take;
    }
    const digits = Array.from({ length: DIGITS_PER_BITS[bits]! }, () => "");
    for (let index = digits.length - 1; index >= 0; index--) {
      digits[index] = BASE2300_ALPHABET[Number(value % RADIX)]!;
      value /= RADIX;
    }
    chunk += digits.join("");
    if (chunk.length >= 8192) {
      chunks.push(chunk);
      chunk = "";
    }
  }
  chunks.push(chunk);
  return header + chunks.join("");
}

/**
 * Restores the legacy identifier, numeric sentinel, and 32-bit zero placeholder for internal use. The 0 is not a real CRC.
 * The caller should skip CRC verification only when confirmed minimal, while maintaining per-type structural validation.
 */
export function expandMinimalBase2300Frame(minimalWire: string): string {
  checkWireLength(minimalWire);
  const header = HEADERS.get(minimalWire.charAt(0));
  if (header === undefined) throw new Error("CRCなしBase2300形式ではありません。");
  const mode = Math.floor(header / 245);
  const tail = header % 245;
  const writer = new Base2300BitWriter(MODES[mode]!);
  // The header character table consists of fixed BMP characters, so the leading UTF-16 unit is always a single element.
  const payload = minimalWire.slice(1);
  let characters = 0;
  for (const symbol of payload) {
    if (++characters >= MAX_SYMBOLS) throw new Error("Base2300 の入力が長すぎます（復元上限 4 MiB）。");
    if (!DIGITS.has(symbol)) throw new Error("Base2300 で使用しない文字があります。空白や異体字も区別されます。");
  }
  if (tail === 0) {
    if (characters !== 0) throw new Error("Base2300 の空データに余分な文字があります。");
    return writer.finish(0);
  }
  const lastDigits = DIGITS_PER_BITS[tail]!;
  if (characters < lastDigits || (characters - lastDigits) % BLOCK_DIGITS !== 0) {
    throw new Error("Base2300 の固定桁数が合いません。");
  }
  const fullBlocks = (characters - lastDigits) / BLOCK_DIGITS;
  if (fullBlocks * BLOCK_BITS + tail + 32 > MAX_EXPANDED_BITS) {
    throw new Error("Base2300 の内部復元データが上限 4 MiB の形式を超えています。");
  }
  let block = 0;
  let digits = 0;
  let value = 0n;
  for (const symbol of payload) {
    value = value * RADIX + BigInt(DIGITS.get(symbol)!);
    digits++;
    const width = block < fullBlocks ? BLOCK_DIGITS : lastDigits;
    if (digits === width) {
      const bits = block < fullBlocks ? BLOCK_BITS : tail;
      if (value >= (1n << BigInt(bits))) throw new Error("Base2300 の値が指定されたビット数の範囲を超えています。");
      writeValue(value, bits, writer);
      block++;
      digits = 0;
      value = 0n;
    }
  }
  const expanded = writer.finish(0);
  if (writer.symbolCount > MAX_SYMBOLS) throw new Error("Base2300 の内部復元データが上限 4 MiB の形式を超えています。");
  return expanded;
}
