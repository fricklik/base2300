import { encode, decode, measureText } from '../dist/index.js';
import { encodeBase2300Advanced, extendBase2300WithNative, decodeBase2300AdvancedAsync } from '../dist/experimental.js';
import { translate } from './i18n.js';

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
self.onmessage = async ({ data: { action, profile, input, lang } }) => {
  // Unknown or missing languages fall back to English inside translate().
  const t = (key, params) => translate(lang, key, params);
  try {
    if ((action !== 'encode' && action !== 'decode') || (profile !== 'checked' && profile !== 'experimental') || typeof input !== 'string') {
      throw new Error(t('errInvalidRequest'));
    }
    const bytes = utf8.encode(input);
    if (strictUtf8.decode(bytes) !== input) throw new Error(t('errSurrogate'));
    if (bytes.length > (action === 'decode' ? MAX_WIRE_BYTES : MAX_TEXT_BYTES)) {
      throw new Error(t('errInputLimit'));
    }
    const started = performance.now();
    if (action === 'decode') {
      const restored = profile === 'checked' ? decode(input) : await decodeBase2300AdvancedAsync(input);
      if (restored.length > MAX_TEXT_BYTES) throw new Error(t('errDecodedLimit'));
      const text = strictUtf8.decode(restored);
      self.postMessage({ output: text, action, rows: [ { label: t('rowEncodedInput'), ...metrics(input) }, { label: t('rowDecodedText'), ...metrics(text), highlight: true } ], note: t('noteDecoded'), milliseconds: performance.now() - started });
      return;
    }
    let output, selected = 'checked v1', integrity = 'crc32';
    if (profile === 'checked') output = encode(bytes);
    else {
      const choice = await extendBase2300WithNative(bytes, encodeBase2300Advanced(bytes, 'fast'));
      output = choice.text; selected = choice.selectedId; integrity = choice.integrity;
    }
    const restored = profile === 'checked' ? decode(output) : await decodeBase2300AdvancedAsync(output);
    if (bytes.length !== restored.length || bytes.some((byte, index) => byte !== restored[index])) throw new Error(t('errRoundTrip'));
    const outputMetrics = metrics(output);
    const sourceMetrics = metrics(input);
    const charDelta = outputMetrics.codePoints - sourceMetrics.codePoints;
    const byteDelta = outputMetrics.utf8Bytes - sourceMetrics.utf8Bytes;
    const signed = n => n > 0 ? `+${n}` : String(n);
    self.postMessage({ output, action, rows: [ { label: t('rowSource'), ...sourceMetrics }, { label: t('rowBase64'), ...metrics(base64(bytes)) }, { label: t(profile === 'checked' ? 'rowChecked' : 'rowExperimental'), ...outputMetrics, highlight: true } ], note: t('noteEncoded', { chars: signed(charDelta), bytes: signed(byteDelta), selected, integrity: t(integrity === 'none' ? 'integrityNone' : 'integrityCrc') }), milliseconds: performance.now() - started });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
