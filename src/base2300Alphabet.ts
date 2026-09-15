// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
import { BASE2200_ALPHABET } from "./base2200Alphabet.js";

/**
 * Fixed alphabet for Base2300 v1. Preserves the Base2200 ordering and appends kana at the end.
 * The "50 sounds" normally contain 46 characters, so each kana row is defined as 46 + ゐ・ゑ・ゔ・っ, giving 50 hiragana and 50 katakana.
 * Adding or reordering characters makes saved encodings undecodable; a version bump is required.
 */
export const BASE2300_HIRAGANA =
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんゐゑゔっ";
export const BASE2300_KATAKANA =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンヰヱヴッ";
export const BASE2300_ALPHABET: readonly string[] = Object.freeze([
  ...BASE2200_ALPHABET,
  ...Array.from(BASE2300_HIRAGANA),
  ...Array.from(BASE2300_KATAKANA),
]);
