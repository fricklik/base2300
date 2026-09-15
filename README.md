# Base2300

**How few characters can hold the same information?**

A curiosity-driven experiment in reversible encoding with **2,300 Unicode
symbols**. Base2300 optimizes Unicode code-point count. Its output can occupy
more UTF-8 bytes even when it uses fewer characters.

[日本語](README.ja.md) · [Measurements](docs/benchmarks.md) ·
[Research & use cases](docs/research.ja.md) · [Wire format](docs/format-v1.md) ·
[Contributing](CONTRIBUTING.md)

Originally built inside a private project by the same author, now extracted as
a self-contained TypeScript library, Node.js CLI and browser playground.
No runtime dependencies, backend service, model download or API key.
**Status: experimental, initial standalone release preparation.**

## The tradeoff, measured

Each cell is **code points / UTF-8 bytes**, including the complete frame.

| Input | Original | Base64 | Base2300, CRC32 | Experimental, CRC-free |
| --- | ---: | ---: | ---: | ---: |
| Short English | 13 / 13 | 20 / 20 | 13 / 37 | 10 / 28 |
| Short Japanese | 9 / 27 | 36 / 36 | 15 / 41 | 10 / 26 |
| Japanese prose | 46 / 138 | 184 / 184 | 58 / 174 | 43 / 123 |
| Emoji sequence | 22 / 80 | 108 / 108 | 62 / 186 | 37 / 107 |
| Deterministic random bytes | — / 4,096 | 5,464 / 5,464 | 2,959 / 8,720 | 2,956 / 8,723 |

The experimental column uses the portable full candidate search without native
compression. These are fixed synthetic examples on Node 22.21.1, not a general
language benchmark. The emoji input contains eight grapheme clusters. Base64
has no checksum; checked Base2300 includes CRC32. A checksum-matched Base64
baseline, native codecs, gzip/Brotli comparisons, failure cases, timings and
transport sizes are in the [reproducible report](docs/benchmarks.md).

The checked random-byte example uses **45.8% fewer code points than Base64**, with
**59.6% more UTF-8 bytes**. Japanese and emoji examples also show that being
shorter than Base64 does not ensure being shorter than the original text.

## Install

```sh
npm install base2300
```

```js
import { encode, decode } from 'base2300';
import { encodeBase2300Advanced } from 'base2300/experimental';
```

Requires Node.js 22+ (or a browser with `TextEncoder`, `BigInt` and, for the
native candidates, `CompressionStream`). The package ships ESM, TypeScript
declarations and the `base2300` CLI. Package version and wire-format version
are independent; see [releasing](docs/releasing.md).

## Try the source checkout

Requires Node.js 22+ and npm. Run these commands in this directory:

```sh
npm ci
npm run check
npm run demo
```

Open **http://127.0.0.1:2300/demo/**. The playground compares code points,
UTF-8 bytes, UTF-16 units and graphemes, verifies exact byte recovery, and runs
conversion in a cancellable Worker. The UI is English by default; a header
toggle switches to Japanese (`?lang=ja` also works). The demo caps source/decoded bytes at 64 KiB;
the library caps them at 4 MiB. Encoded text has a separate, larger bound.
There is no hosted demo; run it locally.

## Basic API: checked v1

From the built checkout:

```js
import { encode, decode, measureText } from './dist/index.js';

const bytes = new TextEncoder().encode('Base2300 packs the same bytes into fewer characters.');
const wire = encode(bytes);
console.log(wire); // あ殻律注架霊慮彫需仕林爽模製兆氏9帝否い壁燃克夢浄備餓計麗蹴香懐叔汰体桜
console.log(measureText(wire)); // { codePoints: 36, utf16Units: 36, utf8Bytes: 106 } (input: 52 / 52 / 52)
const restored = decode(wire); // Uint8Array, exactly the original bytes
```

An installed package uses `import { encode, decode } from 'base2300'`.
`encodeText` / `decodeText` are strict UTF-8 conveniences: they retain a BOM,
reject unpaired JavaScript surrogates, and reject decoding arbitrary binary as
text. Use the byte API for all byte values, including invalid UTF-8.

The root decoder checks CRC32 and accepts only the basic `あ`/`ア` formats.
It rejects malformed data and never trims or normalizes the wire.
CRC32 detects accidental corruption; it does not authenticate or encrypt data.

## Experimental API: optimize the complete character count

```js
import {
  encodeBase2300Advanced,
  extendBase2300WithNative,
  decodeBase2300AdvancedAsync,
} from './dist/experimental.js';

const bytes = new TextEncoder().encode('The same sentence repeats. '.repeat(20));
const portable = encodeBase2300Advanced(bytes, 'fast');
const result = await extendBase2300WithNative(bytes, portable);
console.log(result.text, result.selectedId, result.integrity, result.trials);
const restored = await decodeBase2300AdvancedAsync(result.text);
```

The installed import is `base2300/experimental`. This compares fixed Unicode
models, online predictive coding and, optionally, native DEFLATE/Brotli.
Minimal frames omit CRC32: **a corrupted string can decode successfully**.
Native frames require the matching decoder in the receiving runtime. The
legacy LLM profile from the original project stays reserved and is explicitly
unsupported.
Pass `extendBase2300WithNative` the selection produced from those same bytes;
do not mutate the input or reuse a selection from another message.
See [experimental formats](docs/format-experimental.md).

## CLI

```sh
node bin/base2300.mjs encode input.bin > encoded.txt
node bin/base2300.mjs decode encoded.txt > restored.bin
node bin/base2300.mjs encode --experimental input.txt > compact.txt
node bin/base2300.mjs decode --experimental compact.txt > restored.txt
```

Omit a file name or use `-` to read stdin. Stdout contains only the exact result,
with no added newline. `--native` enables native experiments; use it for decoding
native output too. Keep encoded files byte-exact; editors that add a newline or
normalize characters can break decoding.

## Where this is useful

- **Encoding experiments and teaching:** compare radix, source modeling,
  checksums and different meanings of “length” in one reproducible project.
- **Controlled Unicode text fields:** prototype configuration or replay codes
  where the actual constraint is code points, both endpoints have the decoder,
  and the transport preserves every symbol.
- **A baseline for research:** compare alternative alphabets or predictors on
  identical input and integrity budgets, including negative results.

These are proposed applications, not reported production adoption. There is
no general promise of smaller files, shorter tokens, easier reading, or shorter
output for every input. URLs, ASCII-only channels, manual transcription and
byte-limited storage usually work against this format's objective.

## What to watch

- Most symbols cost three UTF-8 bytes; `𠮟` costs four and two UTF-16 units.
- NFD/NFKD normalization changes `ゔ`/`ヴ`. Do not normalize or case-fold output.
- Code-point count is not display width, grapheme count or LLM token count.
- Alphabet tables, decoder code, candidate CPU time and memory are real costs.
- A fixed alphabet and all wire assignments must remain stable for decoding.
- Source and recovered byte arrays are limited to 4 MiB. Encoded strings have
  a separate length bound and can exceed 4 MiB in UTF-8. Use tighter limits and
  Workers for untrusted input. See [SECURITY.md](SECURITY.md).

## Reproduce and contribute

```sh
npm run benchmark
npm pack --dry-run
```

Start with the [architecture](docs/architecture.md), [research](docs/research.ja.md),
[contribution guide](CONTRIBUTING.md), [validation record](docs/validation.md)
and [release guide](docs/releasing.md).
Unfavorable examples are welcome. The purpose is to learn what this idea can
and cannot do.

## License

[MIT](LICENSE) for the implementation; [Unicode-3.0](licenses/unicode-3.0.txt)
for the derived Unicode data. See [NOTICE](NOTICE) for provenance.
