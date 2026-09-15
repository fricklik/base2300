// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
import { JOYO_KANJI } from "./base2200Alphabet.js";
import {
  Base2300BitReader,
  Base2300BitWriter,
  BoundedByteWriter,
  MAX_BASE2300_BYTES,
  MAX_BASE2300_TEXT_LENGTH,
  appendScalar,
  crc32,
  unpackBase2300Bits,
} from "./base2300.js";

export const SHORT_UNICODE_PRESETS = ["mixed", "japanese"] as const;
export type ShortUnicodePreset = typeof SHORT_UNICODE_PRESETS[number];

const MARKERS: Record<ShortUnicodePreset, string> = { mixed: "お", japanese: "か" };
const ESCAPE = 0x110000;
const COMMON_HIRAGANA = new Set(Array.from("のにとはをがでてしる", (character) => character.codePointAt(0)!));

interface Word {
  length: number;
  value: number;
}

interface Group {
  length: number;
  first: number;
  points: number[];
}

/**
 * A fixed prior based on character category rather than learned frequencies is used as the prefix code.
 * mixed: lowercase+digits 6 bits, uppercase 8, other ASCII 11, hiragana 10, katakana 11,
 *        Joyo kanji 14, Japanese punctuation 13, ESC 14.
 * japanese: 「のにとはをがでてしる」6 bits, remaining hiragana 9, ASCII 10, katakana 11,
 *           Joyo kanji 12, Japanese punctuation 14, ESC 14.
 * Hiragana U+3041..3096, katakana U+30A1..30FA, Japanese punctuation U+3000..303F.
 * Canonical prefix code sorted by (code length, code point) for all entries.
 * ESC is treated as U+110000 and placed last; followed by 21 bits to encode any Unicode scalar.
 * Kraft sum: mixed=.96246337890625, japanese=.99908447265625.
 * No example-word dictionary or input-dependent character table is used; changing categories or order requires a version change.
 */
function makeCodebook(preset: ShortUnicodePreset) {
  const entries: { point: number; length: number }[] = [];
  for (let point = 0; point < 128; point++) {
    let length = 10;
    if (preset === "mixed") {
      if ((point >= 48 && point <= 57) || (point >= 97 && point <= 122)) length = 6;
      else if (point >= 65 && point <= 90) length = 8;
      else length = 11;
    }
    entries.push({ point, length });
  }
  for (let point = 0x3041; point <= 0x3096; point++) {
    entries.push({ point, length: preset === "mixed" ? 10 : COMMON_HIRAGANA.has(point) ? 6 : 9 });
  }
  for (let point = 0x30a1; point <= 0x30fa; point++) entries.push({ point, length: 11 });
  for (let point = 0x3000; point <= 0x303f; point++) entries.push({ point, length: preset === "mixed" ? 13 : 14 });
  for (const character of JOYO_KANJI) entries.push({ point: character.codePointAt(0)!, length: preset === "mixed" ? 14 : 12 });
  entries.push({ point: ESCAPE, length: 14 });
  entries.sort((a, b) => a.length - b.length || a.point - b.point);

  const words = new Map<number, Word>();
  const groups: Group[] = [];
  let value = 0;
  let previousLength = 0;
  for (const { point, length } of entries) {
    value *= 2 ** (length - previousLength);
    if (length !== previousLength) groups.push({ length, first: value, points: [] });
    groups[groups.length - 1]!.points.push(point);
    words.set(point, { length, value: value++ });
    previousLength = length;
  }
  if (words.size !== 2505 || value > 2 ** 14) throw new Error("短文数値化v1の文字表が不正です。");
  return { words, groups, escape: words.get(ESCAPE)! };
}

const CODEBOOKS = { mixed: makeCodebook("mixed"), japanese: makeCodebook("japanese") };

/**
 * 「お」=mixed v1, 「か」=japanese v1. Outputs the leading character, CRC32, and 244-bit numeric blocks.
 * Returns null for invalid UTF-8, output exceeding the limit, or candidates reaching maxCharacters or more.
 * maxCharacters is the Unicode code-point count including the header, not the character count of the original text.
 * The caller compares other formats too, and can output the chosen lossless format even for inputs that do not compress.
 */
export function encodeShortUnicode(input: Uint8Array, preset: ShortUnicodePreset, maxCharacters?: number): string | null {
  if (preset !== "mixed" && preset !== "japanese") throw new Error("未対応の短文数値化モデルです。");
  if (input.length > MAX_BASE2300_BYTES) throw new Error("短文数値化の入力は 4 MiB 以下にしてください。");
  if (maxCharacters !== undefined && maxCharacters !== Infinity && (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0)) {
    throw new Error("短文数値化の文字数上限が不正です。");
  }
  // Character count limit for the shared block decoder. Even when omitted, outputs that cannot be decoded are not produced.
  const limit = Math.min(maxCharacters ?? Infinity, MAX_BASE2300_TEXT_LENGTH / 2 + 1);
  if (limit <= 1) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
  } catch {
    return null;
  }
  const codebook = CODEBOOKS[preset];
  const writer = new Base2300BitWriter(MARKERS[preset]);
  for (const character of text) {
    const point = character.codePointAt(0)!;
    const word = codebook.words.get(point);
    if (word !== undefined) writer.append(word.value, word.length);
    else {
      writer.append(codebook.escape.value, codebook.escape.length);
      writer.append(point, 21);
    }
    if (writer.symbolCount >= limit) return null;
  }
  const wire = writer.finish(crc32(input));
  return writer.symbolCount < limit ? wire : null;
}

/** CRC omission is for internal expansion of the minimal format only. No normalization, BOM removal, or control-character substitution is performed. */
export function decodeShortUnicode(wire: string, verifyChecksum = true): Uint8Array {
  if (wire.length > MAX_BASE2300_TEXT_LENGTH) throw new Error("短文数値化の入力が長すぎます（復元上限 4 MiB）。");
  const preset = wire.startsWith(MARKERS.mixed) ? "mixed" : wire.startsWith(MARKERS.japanese) ? "japanese" : undefined;
  if (preset === undefined) throw new Error("短文数値化v1の形式ではありません。");
  const packed = unpackBase2300Bits(wire);
  if (packed.bitLength < 32) throw new Error("短文数値化のチェックサムが不足しています。");
  const dataBits = packed.bitLength - 32;
  const reader = new Base2300BitReader(packed.bytes, dataBits);
  const codebook = CODEBOOKS[preset];
  const writer = new BoundedByteWriter(MAX_BASE2300_BYTES);
  while (reader.position < dataBits) {
    let value = 0;
    let previousLength = 0;
    let point: number | undefined;
    for (const group of codebook.groups) {
      const take = group.length - previousLength;
      value = value * 2 ** take + reader.read(take);
      const index = value - group.first;
      if (index >= 0 && index < group.points.length) {
        point = group.points[index]!;
        break;
      }
      previousLength = group.length;
    }
    if (point === undefined) throw new Error("短文数値化の入力文字コードが未割当です。");
    if (point === ESCAPE) {
      point = reader.read(21);
      if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("短文数値化に不正なUnicodeコードポイントがあります。");
      if (codebook.words.has(point)) throw new Error("短文数値化に不要なUnicodeエスケープがあります。");
    }
    appendScalar(writer, point);
  }
  const bytes = writer.finish();
  const checksumReader = new Base2300BitReader(packed.bytes, packed.bitLength);
  checksumReader.position = dataBits;
  const expectedChecksum = checksumReader.read(32);
  if (verifyChecksum && crc32(bytes) !== expectedChecksum) throw new Error("チェックサムが一致しません。短文数値化の文字列が変わっている可能性があります。");
  return bytes;
}
