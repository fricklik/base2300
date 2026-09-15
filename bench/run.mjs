import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release, arch } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { brotliCompressSync, brotliDecompressSync, constants, deflateRawSync, inflateRawSync, gzipSync, gunzipSync } from 'node:zlib';
import { BASE2300_ALPHABET, crc32, encodeBase2300, encodeBase2300Binary, decodeBase2300 } from '../dist/index.js';
import { encodeBase2300Advanced, extendBase2300WithNative, decodeBase2300AdvancedAsync, packMinimalBase2300Frame, nativeCompressionSupport, compressNative, decompressNative } from '../dist/experimental.js';
import { makeCorpus } from './corpus.mjs';

const root = new URL('../', import.meta.url);
const iterations = Number(process.env.BASE2300_BENCH_ITERATIONS ?? 3);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) throw new Error('BASE2300_BENCH_ITERATIONS must be 1..100.');
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const codePoints = (text) => [...text].length;
const byteLength = (text) => Buffer.byteLength(text, 'utf8');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (value) => Number(value.toFixed(4));
const forms = ['NFC', 'NFD', 'NFKC', 'NFKD'];

function textMetrics(text) {
  const json = JSON.stringify(text);
  const asciiJson = json.replace(/[\u0080-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  assert.equal(JSON.parse(asciiJson), text);
  return {
    codePoints: codePoints(text), utf16Units: text.length,
    graphemes: Array.from(segmenter.segment(text)).length, utf8Bytes: byteLength(text),
    jsonUtf8Bytes: byteLength(json), asciiEscapedJsonBytes: byteLength(asciiJson),
    uriComponentBytes: byteLength(encodeURIComponent(text)),
    normalizationUnchanged: Object.fromEntries(forms.map((form) => [form, text.normalize(form) === text])),
  };
}

function inputMetrics(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    assert.deepEqual(new TextEncoder().encode(text), bytes);
    return { bytes: bytes.length, sha256: sha256(bytes), text: textMetrics(text) };
  } catch { return { bytes: bytes.length, sha256: sha256(bytes), text: null }; }
}

const wireResult = (text, selected = null) => ({ text, selected });
const base64 = (bytes) => Buffer.from(bytes).toString('base64');
const unbase64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));
function checkedBytes(bytes) {
  const result = new Uint8Array(bytes.length + 4);
  result.set(bytes);
  new DataView(result.buffer).setUint32(bytes.length, crc32(bytes), false);
  return result;
}
function checkTrailer(bytes) {
  assert(bytes.length >= 4);
  const payload = bytes.subarray(0, -4);
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(payload.length, false), crc32(payload));
  return payload;
}

const codecs = [
  { id: 'base64', integrity: 'none', settings: 'RFC 4648, padding included', encode: (bytes) => wireResult(base64(bytes)), decode: unbase64 },
  { id: 'base64url', integrity: 'none', settings: 'RFC 4648 URL alphabet, unpadded (length known out of band)', encode: (bytes) => wireResult(Buffer.from(bytes).toString('base64url')), decode: (text) => new Uint8Array(Buffer.from(text, 'base64url')) },
  { id: 'base64-crc32', integrity: 'crc32', settings: 'Custom comparison envelope: input followed by 4-byte big-endian CRC32, then padded Base64; no mode/version byte', encode: (bytes) => wireResult(base64(checkedBytes(bytes))), decode: (text) => checkTrailer(unbase64(text)) },
  { id: 'gzip-base64', integrity: 'gzip-crc32', settings: 'node:zlib gzip level 9, mtime 0; complete gzip header/trailer; padded Base64', encode: (bytes) => wireResult(base64(gzipSync(bytes, { level: 9, mtime: 0 }))), decode: (text) => new Uint8Array(gunzipSync(unbase64(text))) },
  { id: 'deflate-raw-base64', integrity: 'none', settings: 'node:zlib raw DEFLATE level 6; padded Base64; codec out of band', encode: (bytes) => wireResult(base64(deflateRawSync(bytes, { level: 6 }))), decode: (text) => new Uint8Array(inflateRawSync(unbase64(text))) },
  { id: 'brotli-base64', integrity: 'none', settings: 'node:zlib Brotli quality 5, generic mode, lgwin 22; padded Base64; codec out of band', encode: (bytes) => wireResult(base64(brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC, [constants.BROTLI_PARAM_LGWIN]: 22 } }))), decode: (text) => new Uint8Array(brotliDecompressSync(unbase64(text))) },
  { id: 'base2300-binary-crc', integrity: 'crc32', settings: 'Portable v1 binary mode, marker and CRC32 included', encode: (bytes) => wireResult(encodeBase2300Binary(bytes), 'binary'), decode: decodeBase2300 },
  { id: 'base2300-portable-crc', integrity: 'crc32', settings: 'Portable v1: shortest of binary and fixed source-character code; marker and CRC32 included', encode: (bytes) => wireResult(encodeBase2300(bytes)), decode: decodeBase2300 },
  { id: 'base2300-binary-minimal', integrity: 'none', settings: 'Experimental minimal binary frame; complete header, no CRC32, no compression', encode: (bytes) => wireResult(packMinimalBase2300Frame(bytes, 'ア'), 'v1-binary-minimal'), decode: decodeBase2300AdvancedAsync },
  { id: 'base2300-advanced', integrity: 'selected-frame', settings: 'Experimental full effort: minimal, source-character, short-Unicode, predictive candidates; complete selected frame', encode: (bytes) => { const result = encodeBase2300Advanced(bytes, 'full'); return { text: result.text, selected: result.selectedId, trials: result.trials }; }, decode: decodeBase2300AdvancedAsync },
  { id: 'base2300-advanced-native', integrity: 'selected-frame', settings: 'Experimental full effort plus supported native CompressionStream raw DEFLATE/Brotli; includes candidate search and native asynchronous work', encode: async (bytes) => { const result = await extendBase2300WithNative(bytes, encodeBase2300Advanced(bytes, 'full')); return { text: result.text, selected: result.selectedId, trials: result.trials }; }, decode: decodeBase2300AdvancedAsync },
];

// Same CompressionStream settings as the native candidates, without any text
// preconditioning. Compare these when selection is brotli-0/deflate-raw-0.
for (const format of ['deflate-raw', 'brotli']) {
  const support = nativeCompressionSupport(format);
  if (support.compress && support.decompress) {
    codecs.push({ id: `native-${format}-base64`, integrity: 'none', settings: `Same CompressionStream ${format} runtime defaults as Base2300 native candidates; original bytes, padded Base64, codec out of band`, encode: async (bytes) => wireResult(base64(await compressNative(bytes, format))), decode: async (text) => decompressNative(unbase64(text), format) });
  }
}

// Real upstream source snapshots, with exact local hashes and known-answer
// vectors. They are benchmark-only and never imported by the library.
const optional = [];
const snapshots = JSON.parse(await readFile(new URL('bench/vendor/snapshots.json', root), 'utf8'));
for (const snapshot of snapshots) {
  const url = new URL(`bench/vendor/${snapshot.file}`, root);
  assert.equal(sha256(await readFile(url)), snapshot.sha256, `${snapshot.name} source snapshot hash`);
  const implementation = await import(url.href);
  const example = snapshot.name === 'base2048' ? { bytes: Uint8Array.of(1, 2, 4, 8, 16, 32, 64, 128), wire: 'GƸOʜeҩ' } : { bytes: new TextEncoder().encode('hello world'), wire: '媒腻㐤┖ꈳ埳' };
  assert.equal(implementation.encode(example.bytes), example.wire, `${snapshot.name} upstream README encode vector`);
  assert.deepEqual(implementation.decode(example.wire), example.bytes, `${snapshot.name} upstream README decode vector`);
  codecs.push({ id: snapshot.name, integrity: 'none', settings: `Upstream qntm source snapshot ${snapshot.sha256.slice(0, 12)}; complete output, no checksum`, encode: (bytes) => wireResult(implementation.encode(bytes)), decode: implementation.decode });
  optional.push({ ...snapshot, status: 'measured-vendored', knownAnswerVector: 'passed' });
}

// Additional optional real upstream implementation. Absence is reported.
for (const name of ['base65536']) {
  try {
    const implementation = await import(name);
    codecs.push({ id: name, integrity: 'none', settings: `Installed upstream ${name}; complete output, no checksum`, encode: (bytes) => wireResult(implementation.encode(bytes)), decode: implementation.decode });
    optional.push({ name, status: 'measured', moduleUrl: import.meta.resolve(name) });
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    optional.push({ name, status: 'unavailable', reason: 'Optional upstream package not installed. No measured values are substituted.' });
  }
}

const corpus = makeCorpus();
const rows = [];
for (const sample of corpus) {
  const input = inputMetrics(sample.bytes);
  const results = [];
  for (const codec of codecs) {
    // One warmup per sample/codec. Module import/table startup is outside timing.
    const warmed = await codec.encode(sample.bytes);
    assert.deepEqual(new Uint8Array(await codec.decode(warmed.text)), sample.bytes, `${sample.id}/${codec.id} warmup round trip`);
    const encodeMs = [], decodeMs = [];
    let result;
    for (let iteration = 0; iteration < iterations; iteration++) {
      let started = performance.now();
      result = await codec.encode(sample.bytes);
      encodeMs.push(performance.now() - started);
      started = performance.now();
      const restored = await codec.decode(result.text);
      decodeMs.push(performance.now() - started);
      assert.deepEqual(new Uint8Array(restored), sample.bytes, `${sample.id}/${codec.id} iteration ${iteration} round trip`);
      assert.equal(result.text, warmed.text, `${sample.id}/${codec.id} deterministic output`);
    }
    const metrics = textMetrics(result.text);
    results.push({ codec: codec.id, selected: result.selected, integrity: result.selected === 'v1' ? 'crc32' : codec.integrity === 'selected-frame' ? 'none' : codec.integrity,
      ...metrics, wireSha256: sha256(result.text), encodeMedianMs: round(median(encodeMs)), decodeMedianMs: round(median(decodeMs)), encodeSamplesMs: encodeMs.map(round), decodeSamplesMs: decodeMs.map(round), roundTrip: true,
      ...(result.trials ? { trials: result.trials.map(({ milliseconds, ...trial }) => trial) } : {}),
    });
  }
  rows.push({ id: sample.id, description: sample.description, input, results });
  process.stdout.write(`${sample.id}: ${results.length} codecs round-tripped\n`);
}

const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const artifact = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), projectVersion: pkg.version,
  runtime: { node: process.version, v8: process.versions.v8, unicode: process.versions.unicode, icu: process.versions.icu, zlib: process.versions.zlib, brotli: process.versions.brotli, os: platform(), osRelease: release(), arch: arch(), cpuModel: cpus()[0]?.model ?? null },
  method: { iterations, warmups: 1, codecCount: codecs.length, sampleCount: rows.length, roundTripsVerified: rows.length * codecs.length * (iterations + 1), statistic: 'median (upper middle for even counts)', timingUnit: 'milliseconds', timingIncludes: 'encode/decode work and async call overhead; advanced includes candidate search', timingExcludes: 'imports, table initialization, corpus construction, metrics, assertions, file writes', corpus: '20 fixed synthetic cases; bytes and SHA-256 included; corpus.mjs defines all data', noExternalModel: true, headersIncluded: true, optionalImplementations: optional },
  nativeSupport: Object.fromEntries(['deflate-raw', 'brotli'].map((format) => [format, nativeCompressionSupport(format)])),
  alphabet: { symbols: BASE2300_ALPHABET.length, codePoints: codePoints(BASE2300_ALPHABET.join('')), utf16Units: BASE2300_ALPHABET.join('').length,
    utf8ByteHistogram: Object.fromEntries([1, 2, 3, 4].map((length) => [length, BASE2300_ALPHABET.filter((symbol) => byteLength(symbol) === length).length])),
    normalizationChanges: Object.fromEntries(forms.map((form) => [form, BASE2300_ALPHABET.filter((symbol) => symbol.normalize(form) !== symbol).map((symbol) => ({ symbol, normalized: symbol.normalize(form) }))])),
  },
  codecs: codecs.map(({ id, integrity, settings }) => ({ id, integrity, settings })), rows,
};

function table(headers, records) { return ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...records.map((record) => '| ' + record.join(' | ') + ' |')].join('\n'); }
const ordered = codecs.map((codec) => codec.id);
const shortName = (id) => ({ 'base2300-binary-crc': 'B2300 binary CRC', 'base2300-portable-crc': 'B2300 portable CRC', 'base2300-binary-minimal': 'B2300 binary minimal', 'base2300-advanced': 'B2300 advanced', 'base2300-advanced-native': 'B2300 advanced native' })[id] ?? id;
const select = (row, codec) => row.results.find((result) => result.codec === codec);
const cell = (result) => `${result.codePoints} / ${result.utf8Bytes}`;
let markdown = `# Reproducible benchmark / 実測比較\n\nGenerated by \`node bench/run.mjs\`. Raw data: [results.json](../bench/results.json). Corpus: [corpus.mjs](../bench/corpus.mjs). Interpretation and sources: [research.ja.md](research.ja.md).\n\n`;
markdown += `## Run environment\n\n- Run: ${artifact.generatedAt}; package ${pkg.version}.\n- Node ${process.version}; V8 ${process.versions.v8}; ICU ${process.versions.icu}; Unicode ${process.versions.unicode}; zlib ${process.versions.zlib}; Brotli ${process.versions.brotli}.\n- ${platform()} ${release()} ${arch()}; ${artifact.runtime.cpuModel}.\n- ${iterations} timed iterations and one warmup per sample/codec. Median encode/decode milliseconds; import/startup/measurement/assertion overhead excluded. Async calls and candidate searches included. No confidence intervals, peak memory measurements, or cross-platform performance claim.\n- Native support: ${Object.entries(artifact.nativeSupport).map(([name, support]) => `${name}: encode=${support.compress}, decode=${support.decompress}`).join('; ')}. Native compression parameters are runtime defaults; Node zlib comparison settings are explicit below.\n\n`;
markdown += `Verified **${rows.length} inputs × ${codecs.length} codecs × ${iterations + 1} runs = ${artifact.method.roundTripsVerified} exact byte round trips**, plus upstream known-answer vectors and source-snapshot hashes.\n\n`;
markdown += '## Reproduce\n\n```sh\nnpm ci\nnpm run build\nnode bench/run.mjs\n# Optional, with network access: add a Base65536 comparator.\nnpm install --no-save --package-lock=false base65536\nnode bench/run.mjs\n```\n\nSet `BASE2300_BENCH_ITERATIONS=10` for more timing samples. Output sizes and corpus hashes are deterministic for the same codec/runtime versions; timestamps/timings vary. Compression implementation versions can change compressed bytes. Base2048/Base32768 use [vendored upstream source snapshots](../bench/vendor/README.md) with SHA-256 and known-answer checks. Additional optional packages are detected at runtime and are never required by the library.\n\n';
markdown += '## Fairness and definitions / 比較条件\n\n- Every output includes its actual framing, padding, headers, and trailers. No external dictionary or LLM is used. Format choice for Base64/DEFLATE/Brotli is known out of band; Base2300 includes a format marker. Application field names or transport envelopes are not included.\n- Portable Base2300 includes CRC32. Base64, Base64url, minimal Base2300, raw DEFLATE, Brotli and qntm base encodings do not add an application checksum. Gzip has a CRC32 trailer. The custom `base64-crc32` row makes the checksum cost visible, but has no mode/version byte. Compare equivalent integrity requirements before choosing a format. CRC32 is not authentication.\n- The headline cell is **Unicode code points / UTF-8 bytes**, both for the complete output. Source text is measured by code points; invalid UTF-8 has no source character count. A shorter encoding than Base64 does not imply a shorter string than the original prose.\n- `utf16Units` is JavaScript `String.length`; graphemes use this runtime’s `Intl.Segmenter("ja")`. They are different units. Base2300 has the supplementary character 𠮟, so code points and UTF-16 units need not agree.\n- JSON sizes include surrounding quotes. `JSON UTF-8` is `JSON.stringify`; `ASCII JSON` escapes every non-ASCII UTF-16 unit as `\\uXXXX` (a supplementary character needs two). `URL component` measures `encodeURIComponent(output)`, without an URL, parameter name, or separator. It is not a universal URL policy or QR size.\n- All warmup and measured encode/decode operations assert exact byte equality and repeated output stability. This synthetic corpus explores favorable and unfavorable examples; it is not representative of all language, production traffic, or cryptographic randomness. No LLM token count is measured.\n\n';
markdown += '## Codec settings\n\n' + table(['Codec', 'Integrity', 'Settings'], codecs.map(({ id, integrity, settings }) => [shortName(id), integrity, settings])) + '\n\n';
markdown += '## Complete output: code points / UTF-8 bytes\n\n' + table(['Sample', 'Input bytes', 'Input code points', ...ordered.map(shortName)], rows.map((row) => [row.id, row.input.bytes, row.input.text?.codePoints ?? 'binary', ...ordered.map((id) => cell(select(row, id)))])) + '\n\n';
markdown += '## Character units and transport expansions\n\nAll codecs and samples are in the JSON. These rows illustrate common transport costs.\n\n' + table(['Sample / codec', 'Code points', 'UTF-16 units', 'Graphemes', 'UTF-8 bytes', 'JSON UTF-8 bytes', 'ASCII JSON bytes', 'URL component bytes', 'Selected candidate'], rows.filter((row) => ['short-japanese', 'emoji', 'random-4096', 'repeated-japanese'].includes(row.id)).flatMap((row) => ['base64', 'base64url', 'gzip-base64', 'brotli-base64', 'base2300-portable-crc', 'base2300-advanced-native'].map((id) => { const r = select(row, id); return [`${row.id} / ${shortName(id)}`, r.codePoints, r.utf16Units, r.graphemes, r.utf8Bytes, r.jsonUtf8Bytes, r.asciiEscapedJsonBytes, r.uriComponentBytes, r.selected ?? '—']; }))) + '\n\n';
markdown += '## Timing: median encode / decode milliseconds\n\nSmall values are dominated by runtime noise. Advanced selection performs several compressions; this is the public operation’s cost, not a compression-algorithm-only speed contest.\n\n' + table(['Sample', ...ordered.map(shortName)], rows.map((row) => [row.id, ...ordered.map((id) => { const r = select(row, id); return `${r.encodeMedianMs} / ${r.decodeMedianMs}`; })])) + '\n\n';
markdown += '## Alphabet and normalization audit\n\n' + `- ${artifact.alphabet.symbols} symbols, ${artifact.alphabet.utf16Units} UTF-16 units in the concatenated alphabet.\n- UTF-8 bytes per symbol histogram: ${JSON.stringify(artifact.alphabet.utf8ByteHistogram)}.\n` + forms.map((form) => `- ${form}: ${artifact.alphabet.normalizationChanges[form].length} alphabet symbols change${artifact.alphabet.normalizationChanges[form].length ? ': ' + artifact.alphabet.normalizationChanges[form].map((item) => `${item.symbol} → ${item.normalized}`).join(', ') : ''}.`).join('\n') + '\n\nWhole-output normalization equality for every result is also recorded in JSON. NFD/NFKD transport can change encoded kana, so do not normalize the wire string. A future alphabet change requires a new version.\n\n';
markdown += '## Upstream implementations\n\n' + table(['Package', 'Status', 'Detail'], optional.map((item) => [item.name, item.status, item.reason ?? item.moduleUrl ?? `SHA-256 ${item.sha256}; README vector passed`])) + '\n\nVendored Base2048/Base32768 are the upstream algorithms and alphabets, not estimated lengths or substitute implementations. Snapshot provenance and licenses are in [bench/vendor](../bench/vendor/README.md). Unavailable means not measured. Theoretical density comparisons in the research document are explicitly separate from these measured tables.\n';
await mkdir(new URL('bench/', root), { recursive: true });
await mkdir(new URL('docs/', root), { recursive: true });
await writeFile(new URL('bench/results.json', root), JSON.stringify(artifact, null, 2) + '\n');
await writeFile(new URL('docs/benchmarks.md', root), markdown);
process.stdout.write(`Wrote ${fileURLToPath(new URL('bench/results.json', root))} and docs/benchmarks.md\n`);
