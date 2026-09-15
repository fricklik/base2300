import { encode, decode, measureText } from '../dist/index.js';
import { encodeBase2300Advanced, extendBase2300WithNative, decodeBase2300AdvancedAsync } from '../dist/experimental.js';

const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_TEXT_BYTES = 64 * 1024;
// A checked binary frame always fits this many symbols; one symbol needs at most 4 UTF-8 bytes.
const MAX_WIRE_BYTES = 4 * (1 + Math.ceil((MAX_TEXT_BYTES * 8 + 32) / 244) * 22);
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
function metrics(text) {
  let graphemes = 0;
  for (const _ of segmenter.segment(text)) graphemes++;
  return { ...measureText(text), graphemes };
}
function base64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
self.onmessage = async ({ data: { action, profile, input } }) => {
  try {
    if ((action !== 'encode' && action !== 'decode') || (profile !== 'checked' && profile !== 'experimental') || typeof input !== 'string') {
      throw new Error('操作・形式・入力テキストが不正です。');
    }
    const bytes = utf8.encode(input);
    if (strictUtf8.decode(bytes) !== input) throw new Error('入力に対を持たないUTF-16サロゲートがあります。');
    if (bytes.length > (action === 'decode' ? MAX_WIRE_BYTES : MAX_TEXT_BYTES)) {
      throw new Error('このデモは元テキスト／復元結果64 KiBまでです。大きい入力にはライブラリまたはCLIを使用してください。');
    }
    const started = performance.now();
    if (action === 'decode') {
      const restored = profile === 'checked' ? decode(input) : await decodeBase2300AdvancedAsync(input);
      if (restored.length > MAX_TEXT_BYTES) throw new Error('このデモの復元結果上限は64 KiBです。大きいデータにはライブラリまたはCLIを使用してください。');
      const text = strictUtf8.decode(restored);
      self.postMessage({ output: text, action, rows: [ { label: '符号化された入力', ...metrics(input) }, { label: '復元テキスト', ...metrics(text), highlight: true } ], note: 'UTF-8テキストとして復元しました。表示・手動コピーでは改行形式が変わる場合があります。厳密なバイト保存や任意バイナリにはCLIを使用してください。', milliseconds: performance.now() - started });
      return;
    }
    let output, selected = 'checked v1', integrity = 'crc32';
    if (profile === 'checked') output = encode(bytes);
    else {
      const choice = await extendBase2300WithNative(bytes, encodeBase2300Advanced(bytes, 'fast'));
      output = choice.text; selected = choice.selectedId; integrity = choice.integrity;
    }
    const restored = profile === 'checked' ? decode(output) : await decodeBase2300AdvancedAsync(output);
    if (bytes.length !== restored.length || bytes.some((byte, index) => byte !== restored[index])) throw new Error('元バイトへの復元検査に失敗しました。');
    const outputMetrics = metrics(output);
    const sourceMetrics = metrics(input);
    const charDelta = outputMetrics.codePoints - sourceMetrics.codePoints;
    const byteDelta = outputMetrics.utf8Bytes - sourceMetrics.utf8Bytes;
    const signed = n => n > 0 ? `+${n}` : String(n);
    self.postMessage({ output, action, rows: [ { label: '元テキスト', ...sourceMetrics }, { label: 'Base64', ...metrics(base64(bytes)) }, { label: profile === 'checked' ? 'Base2300 · CRC32付き' : 'Base2300 · 実験形式', ...outputMetrics, highlight: true } ], note: `原バイトとの一致を確認。文字数 ${signed(charDelta)}、UTF-8 ${signed(byteDelta)} B。選択: ${selected}。${integrity === 'none' ? 'CRCなし：転送後の誤記・破損は検出できない場合があります。' : 'CRC32付き。'}`, milliseconds: performance.now() - started });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
