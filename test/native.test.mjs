import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync, brotliCompressSync } from 'node:zlib';
import {
  compressNative, decompressNative, nativeCompressionSupport,
  NativeCompressionLimitError, NativeCompressionUnavailableError,
  encodeBase2300Advanced, extendBase2300WithNative, decodeBase2300AdvancedAsync,
} from '../dist/experimental.js';

const utf8 = (text) => new TextEncoder().encode(text);
const same = (actual, expected) => assert.deepEqual(Uint8Array.from(actual), Uint8Array.from(expected));

test('native DEFLATE interoperates with zlib on empty, text and arbitrary byte data', async () => {
  const support = nativeCompressionSupport('deflate-raw');
  assert.deepEqual(support, { compress: true, decompress: true });
  for (const input of [new Uint8Array(), utf8('Base2300 packs the same bytes into fewer characters.'), utf8('予測と圧縮の比較。'.repeat(2000)), Uint8Array.from({ length: 8192 }, (_, i) => i & 255)]) {
    const compressed = await compressNative(input, 'deflate-raw');
    same(inflateRawSync(compressed), input);
    same(await decompressNative(compressed, 'deflate-raw'), input);
    same(await decompressNative(deflateRawSync(input), 'deflate-raw'), input);
  }
});

test('native decoding rejects trailing data, truncation, expansion bombs and invalid limits', async () => {
  const input = utf8('保存したデータを別の実装で復元する。');
  const wire = deflateRawSync(input);
  await assert.rejects(decompressNative(Uint8Array.from([...wire, 0]), 'deflate-raw'));
  await assert.rejects(decompressNative(wire.subarray(0, wire.length - 1), 'deflate-raw'));
  await assert.rejects(decompressNative(deflateRawSync(new Uint8Array(4 * 1024 * 1024 + 1)), 'deflate-raw'), NativeCompressionLimitError);
  await assert.rejects(decompressNative(wire, 'deflate-raw', { maxOutputBytes: input.length - 1 }), NativeCompressionLimitError);
  same(await decompressNative(wire, 'deflate-raw', { maxOutputBytes: input.length }), input);
  await assert.rejects(compressNative(input, 'deflate-raw', { maxOutputBytes: 0 }), NativeCompressionLimitError);
  await assert.rejects(decompressNative(wire, 'deflate-raw', { maxOutputBytes: Infinity }), RangeError);
});

test('native Brotli either interoperates with zlib or reports unsupported capability', async () => {
  const input = utf8('圧縮方式は出力文字数で選ぶ。'.repeat(100));
  const pending = decompressNative(brotliCompressSync(input), 'brotli');
  if (nativeCompressionSupport('brotli').decompress) {
    same(await pending, input);
    const wire = brotliCompressSync(input);
    for (const suffix of [[0], [1], [0, 0], wire]) {
      await assert.rejects(decompressNative(Uint8Array.from([...wire, ...suffix]), 'brotli'));
    }
    await assert.rejects(decompressNative(wire.subarray(0, wire.length - 1), 'brotli'));
  }
  else await assert.rejects(pending, NativeCompressionUnavailableError);
});

test('native extension preserves shortest selection, metadata and asynchronous round-trip', async () => {
  const input = utf8('Base2300 packs the same bytes into fewer characters. '.repeat(100));
  const previous = encodeBase2300Advanced(input);
  const snapshot = JSON.stringify(previous);
  const selected = await extendBase2300WithNative(input, previous);
  assert.equal(JSON.stringify(previous), snapshot);
  assert.ok([...selected.text].length <= [...previous.text].length);
  assert.equal(selected.integrity, 'none');
  same(await decodeBase2300AdvancedAsync(selected.text), input);
});

test('aborts before and during native work propagate as AbortError', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(compressNative(new Uint8Array(), 'deflate-raw', { signal: controller.signal }), { name: 'AbortError' });
  const input = utf8('abc');
  await assert.rejects(extendBase2300WithNative(input, encodeBase2300Advanced(input), controller.signal), { name: 'AbortError' });
  await assert.rejects(decodeBase2300AdvancedAsync('包', controller.signal), { name: 'AbortError' });
  const active = new AbortController();
  const pending = compressNative(new Uint8Array(1024 * 1024), 'deflate-raw', { signal: active.signal });
  active.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
