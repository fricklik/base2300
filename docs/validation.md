# Validation of the initial extraction

Date: 2026-09-15. Runtime: Node.js 22.21.1, TypeScript 5.9.3, macOS arm64.
Local results unless stated otherwise. The GitHub Actions matrix has since run
remotely; see "Repository publication and CI" below.

## Completed checks

| Check | Exit code | Evidence |
| --- | --- | --- |
| `npm run check` | 0 | Type checking, build, 36 tests; 36 passed, 0 failed, 0 skipped |
| `node bench/run.mjs` | 0 | 20 inputs × 15 codecs × 4 repetitions = 1,200 exact byte round trips |
| Upstream benchmark snapshots | 0 | SHA-256 hashes and published Base2048/Base32768 known-answer vectors pass |
| Source UI compatibility audit | 0 | 76 checked, advanced and native comparisons; exact wire and reciprocal byte recovery |
| Final `npm pack --cache <temporary-cache> --pack-destination <temporary-directory>` | 0 | Build succeeds; library, CLI, declarations, source, format docs and licenses included |
| Offline install into an empty temporary project | 0 | Exactly one package installed; root/experimental ESM imports, CLI binary round trip and strict TypeScript NodeNext consumer pass |
| Local documentation links and JS syntax | 0 | No missing local Markdown targets; demo and server scripts parse |

The tests include independent fixed vectors, a fixed 64 KiB output hash,
4 MiB checked and minimal round trips, all 244 minimal tail-bit lengths,
invalid UTF-8, BOM/CRLF/NUL, combining sequences, supplementary characters,
malformed frames, CRC corruption, predictive canonical termination, unsupported
LLM profiles, native limits/cancellation and trailing-data rejection.

One inherited issue was fixed during extraction: the tested native Brotli
decoder ignored data appended after a complete stream. The standalone native
wrapper now rejects it. An independent audit checked 24 appended-stream cases
across DEFLATE/Brotli while retaining normal decoding. The original project's
files were not changed. More details are in [the design review](design-review.md).

## Demo validation and its limits

The actual `demo/worker.js` module was executed with its message endpoint
simulated in Node. It preserves bytes through the text path, handles the 64 KiB
source/decoded limit and a larger encoded wire, and reports invalid inputs.
The real HTTP handler was exercised without opening a socket. Those four tests
are included in the 36-test total.

A separate jsdom smoke check exercised the actual UI module with simulated
Workers: stale messages/errors, cancellation, timeout, constructor/post failure,
round-trip action and clipboard CRLF preservation. jsdom and Playwright are not
library dependencies. This check does not establish browser rendering behavior.

`scripts/check-browser.mjs` was first attempted in a sandbox that blocked both
the loopback listener (`listen EPERM`) and the Chromium launch (MachPort
bootstrap permission denied). It was re-run on 2026-09-15 outside that sandbox
with Playwright 1.62.1 (`BASE2300_PLAYWRIGHT_MODULE` pointing at an existing
`playwright/index.mjs`) and completed with exit code 0:

```json
{"browser":"151.0.7922.34","roundTrips":5,"malformedRejected":true,"demoLimitRejected":true,"mobileOverflow":false,"pageErrors":[],"externalRequests":[]}
```

This covers the actual UI conversion, five encode/decode round trips including
BOM/combining/NUL/supplementary/emoji input, malformed-input rejection, the 64 KiB
demo limit, no horizontal overflow at 390 px width, no page errors and no
external requests. A full-page screenshot at 1280 px was produced and inspected
manually (layout, comparison table and result note render as intended); the
image is not committed. The [release guide](releasing.md) gives the command.

## Distribution cost

At this extraction, traversing static imports from compiled ESM entry points and
summing their JavaScript source gives the following unminified code footprint:

| Entry | JS modules | Bytes | Gzip level 9 of concatenated modules |
| --- | ---: | ---: | ---: |
| Basic `index.js` | 4 | 27,525 | 12,619 |
| `experimental.js` | 10 | 75,323 | 25,506 |

These figures include alphabet data and comments. They exclude declarations,
source maps, documentation and module-loading overhead. Concatenated gzip size
is an estimate of code distribution cost, not a measured browser transfer or a
valid bundled artifact. Actual imports, bundling and per-file compression change
the transferred bytes. This is separate from encoded-message size.

## Environmental and external work still unverified

- Registry DNS access was unavailable. The pinned TypeScript lock metadata and
  compiler came from the existing local installation; `npm ci` network fetching
  was not validated here. No global npm cache or authentication was modified.
- The original default npm cache was not writable in this sandbox; using a
  temporary cache allowed the final package build/install checks to succeed.
- No npm publication, release tag or hosted playground has been created.
  The repository itself was published later the same day (next section).
- `/fable-ask` first failed on both models (exit 3, empty stderr). A second run
  outside the sandbox showed the primary `claude-fable-5` blocked by a monthly
  spend limit; the fallback `claude-opus-4-8[1m]` returned a review. Its claims
  were checked against the source and recorded with verdicts in
  [the design review](design-review.md). It is an Opus 4.8 answer, not Fable 5.
- Base65536 remains an optional, unmeasured comparator. Base2048/Base32768 use
  documented source snapshots, not a claimed npm release or upstream commit.

## Repository publication and CI

The first `gh auth status` check failed inside the extraction sandbox. Outside
it, the account was authenticated and the public repository
<https://github.com/fricklik/base2300> was created on 2026-09-15 with `main`
pushed. The first GitHub Actions run (`ci.yml`, run 34921078325) completed with
conclusion `success` on all six matrix jobs: Node 22 and 24 on ubuntu-latest,
windows-latest and macos-latest. Each job ran `npm ci`, `npm test` (36 tests)
and `npm pack --dry-run`; the Linux/Node 22 job also ran `node bench/run.mjs`.
This also validates the `npm ci` network fetch that the sandbox could not.
The runner emitted a deprecation notice that `actions/checkout@v4` and
`actions/setup-node@v4` target Node.js 20; they are forced onto Node.js 24 by
GitHub and still pass, but upgrading the action majors is a pending chore.

The source is a standalone repository, now with a public remote. npm
publication and a release tag remain separate, deliberate steps.
