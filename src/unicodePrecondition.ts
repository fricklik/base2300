// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
/**
 * Reversible preprocessing that passes character boundaries for languages such as Japanese to a predictor.
 * Does not alter meaning, reading, or normalization form; represents the same UTF-8 text as a sequence of UTF-16LE units.
 * This preprocessing is used only when the overall compressed output is shorter.
 */
export function toUnicodeUnits(bytes: Uint8Array): Uint8Array | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
  // Do not produce candidates that exceed the input limit from preprocessing alone.
  if (text.length > 2 * 1024 * 1024) return null;
  const result = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    result[i * 2] = unit & 255;
    result[i * 2 + 1] = unit >>> 8;
  }
  return result;
}

export function fromUnicodeUnits(bytes: Uint8Array, maximum: number): Uint8Array {
  if (bytes.length % 2) throw new Error("Unicode前処理のデータが途中で終わっています。");
  const chunks: string[] = [];
  let chunk = "";
  let totalBytes = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const unit = bytes[i]! | (bytes[i + 1]! << 8);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (i + 3 >= bytes.length) throw new Error("Unicode前処理のサロゲートペアが不正です。");
      const low = bytes[i + 2]! | (bytes[i + 3]! << 8);
      if (low < 0xdc00 || low > 0xdfff) throw new Error("Unicode前処理のサロゲートペアが不正です。");
      chunk += String.fromCharCode(unit, low);
      i += 2;
      totalBytes += 4;
    } else {
      if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("Unicode前処理のサロゲートペアが不正です。");
      chunk += String.fromCharCode(unit);
      totalBytes += unit < 128 ? 1 : unit < 2048 ? 2 : 3;
    }
    if (totalBytes > maximum) throw new Error("復元データが上限 4 MiB を超えています。");
    if (chunk.length >= 8192) { chunks.push(chunk); chunk = ""; }
  }
  chunks.push(chunk);
  return new TextEncoder().encode(chunks.join(""));
}
