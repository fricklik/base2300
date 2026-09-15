# Benchmark-only upstream source snapshots

These are qntm's real Base2048 and Base32768 implementations, used only by the
benchmark. The Base2300 library does not depend on or ship these as its runtime
implementation. Each upstream MIT license is retained beside the source.

| Snapshot | Upstream source | License |
| --- | --- | --- |
| `base2048.mjs` | [qntm/base2048 src/index.js](https://raw.githubusercontent.com/qntm/base2048/main/src/index.js) | [MIT, copyright 2017 qntm](base2048-LICENSE.txt) |
| `base32768.mjs` | [qntm/base32768 src/index.js](https://raw.githubusercontent.com/qntm/base32768/main/src/index.js) | [MIT, copyright 2021 qntm](base32768-LICENSE.txt) |

Retrieved on 2026-09-15 through the web text view because shell DNS access to the
npm registry was unavailable. The source lines were captured programmatically;
the `.mjs` extension identifies ESM. The retrieval view can collapse blank lines,
so these are not claimed to be byte-identical npm release files. The algorithms,
character ranges, and source statements were not reimplemented or edited.

The precise upstream commit was not independently established. Do not infer a
commit from the moving `main` URL. Instead, this repository pins the exact local
snapshot using the SHA-256 values in [snapshots.json](snapshots.json).
The benchmark verifies those hashes before importing the files and verifies the
published upstream README examples in both directions:

- Base2048: bytes `[1, 2, 4, 8, 16, 32, 64, 128]` ↔ `GƸOʜeҩ`.
- Base32768: UTF-8 `hello world` ↔ `媒腻㐤┖ꈳ埳`.

All benchmark samples additionally require exact byte round trips. Report these
as source-snapshot measurements, not as a particular npm package release.
