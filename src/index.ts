/** Stable, CRC32-checked Base2300 v1 API. See base2300/experimental for CRC-free profiles. */
import { encodeBase2300 as encodeBytes, decodeBase2300 as decodeBytes } from "./base2300.js";

export {
  MAX_BASE2300_BYTES,
  MAX_BASE2300_TEXT_LENGTH,
  encodeBase2300Binary,
  encodeBase2300Text,
  getBase2300Mode,
  crc32,
} from "./base2300.js";
export { BASE2300_ALPHABET, BASE2300_HIRAGANA, BASE2300_KATAKANA } from "./base2300Alphabet.js";
// Alphabet building blocks, exported so downstream code can build derived tables without copying the data.
export { BASE64_ALPHABET, JOYO_KANJI, BASE2200_ALPHABET } from "./base2200Alphabet.js";

/** Encode arbitrary bytes; choose the shorter checked text or binary representation. */
export function encode(input: Uint8Array): string {
  if (!(input instanceof Uint8Array)) throw new TypeError("encode expects a Uint8Array.");
  return encodeBytes(input);
}

/** Decode checked v1 data. Whitespace, normalization and checksum bypass are never applied. */
export function decode(wire: string): Uint8Array {
  if (typeof wire !== "string") throw new TypeError("decode expects a string.");
  return decodeBytes(wire, true);
}

export { encode as encodeBase2300, decode as decodeBase2300 };

/** Preserve valid Unicode exactly; reject lone UTF-16 surrogates instead of replacing them. */
export function encodeText(text: string): string {
  if (typeof text !== "string") throw new TypeError("encodeText expects a string.");
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = text.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError("Text contains an unpaired UTF-16 surrogate.");
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("Text contains an unpaired UTF-16 surrogate.");
    }
  }
  return encode(new TextEncoder().encode(text));
}

/** Decode UTF-8 strictly, including an initial BOM if present; use decode() for arbitrary bytes. */
export function decodeText(wire: string): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(decode(wire));
}

/** Count Unicode code points, UTF-16 code units and serialized UTF-8 bytes separately. */
export function measureText(text: string): { codePoints: number; utf16Units: number; utf8Bytes: number } {
  let codePoints = 0;
  for (const _character of text) codePoints++;
  return { codePoints, utf16Units: text.length, utf8Bytes: new TextEncoder().encode(text).length };
}
