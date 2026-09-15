# Experimental Base2300 formats

These formats preserve the original implementation's portable output. Import them through
`base2300/experimental`. Package version 0.1.0 does not redefine their wire
identifiers. This document specifies the framing and maps codec details to the
reference source; it is not yet a complete language-independent specification
of every adaptive probability update.

## Alphabet and header

Use the exact 2,300-symbol alphabet from [checked v1](format-v1.md). No Unicode
normalization, case conversion, whitespace removal or spelling substitution is
part of decoding.

For a minimal frame, the first code point is:

```text
alphabet[64 + modeIndex * 245 + tailBits]
```

`tailBits` is 0 only for empty data; otherwise `(dataBits - 1) % 244 + 1`.
The original assignment covers **8 × 245 = 1,960** BMP header symbols,
including the reserved LLM mode. Its slot must not be reused.

| modeIndex | Payload codec | Checked marker | Standalone support |
| --- | --- | --- | --- |
| 0 | Fixed source-character code | `あ` | Yes |
| 1 | Raw bytes | `ア` | Yes |
| 2 | Mixed short-Unicode code | `お` | Yes |
| 3 | Japanese short-Unicode code | `か` | Yes |
| 4 | PC1 predictive arithmetic code | `い` | Yes |
| 5 | Raw DEFLATE | `う` | Runtime capability required |
| 6 | Brotli | `え` | Runtime capability required |
| 7 | Original daemon-dependent LLM code | `き` | Reserved; explicit unsupported error |

Body bits are read most-significant first, in blocks of at most 244 bits. A
complete block occupies 22 base-2300 digits. A final block of `b` bits occupies
the smallest integer `d` such that `2300^d >= 2^b`. Digits are most-significant
first and left-padded with `alphabet[0]`, `A`. A block value must be less than
`2^b`. There is no sentinel bit or CRC32 in a minimal frame. A zero-length body
requires no body digits. The minimal empty binary frame is `包`.

Decoders reject invalid headers, alphabet symbols, body widths, values outside
the bit range, and decoded output beyond 4 MiB. Valid structure does not prove
uncorrupted data. `isBase2300` and `isMinimalBase2300` identify headers only.

Reference: [minimalBase2300.ts](../src/minimalBase2300.ts).

## Payload models

Modes 0–3 contain the source code's bits directly. Mode 0 is documented in
[v1](format-v1.md). Modes 2/3 use fixed canonical prefix codes, including an
escape plus 21-bit Unicode scalar for other characters. Their exact code-point
groups, lengths and ordering are in
[shortUnicodeCompression.ts](../src/shortUnicodeCompression.ts).

Modes 4–6 start with one preprocessing byte, followed by compressed bytes:

| Byte | Representation before compression |
| --- | --- |
| 0 | Original bytes |
| 1 | UTF-16LE units of strictly valid UTF-8, preserving BOM and exact scalars |

Malformed UTF-8 is not replaced with U+FFFD: use representation 0. UTF-16LE
recovery rejects invalid surrogates. See
[unicodePrecondition.ts](../src/unicodePrecondition.ts).

PC1 includes a version/model tag and canonical unsigned LEB128 original byte
length. It uses a 32-bit arithmetic interval and 12-bit probabilities, with
order 0, 1 or 3 contexts and a stored fallback. Counters, rounding, hash, update
order and canonical termination are part of the format; the reference is
[predictiveCompression.ts](../src/predictiveCompression.ts). Its model adapts
from the message itself, so no external training corpus or weights are needed.

Raw DEFLATE and Brotli use the formats exposed by the runtime's compression
streams. Output bytes and candidate selection may vary between implementations.
Both sender and receiver need the relevant capability. The API does not select
Brotli quality settings. See [nativeCompression.ts](../src/nativeCompression.ts).

Checked variants use the same sentinel/block framing as v1 and append the
CRC32 of the **original bytes before preprocessing**, not the compressed payload.
The advanced decoders also support these checked portable variants. The default
root `decode` accepts only the checked `あ`/`ア` basic format.

## Selection and resources

`encodeBase2300Advanced(bytes, effort)` compares complete code-point counts of
the basic checked candidate, minimal binary/text, short Unicode and predictive
candidates. Ties retain the earlier candidate. It returns the chosen wire,
candidate identifier, trial counts/timings and `integrity` metadata. Never infer
CRC coverage from the API name; inspect the selected frame.

`full` tries all implemented predictive models. `fast` keeps full comparison
through 16 KiB of original input; above that, only order 1 is tried, and each
representation (raw or UTF-16LE) skips prediction if its byte length exceeds
128 KiB. Neither option promises globally shortest output or output shorter
than the source text. The 4 MiB limit on source and recovered bytes is not a
CPU deadline or a 4 MiB cap on the encoded string's UTF-8 size.

`extendBase2300WithNative` adds native candidates when both compression and
decompression are available. Its `previous` selection must have been produced
from the same unchanged `bytes`; the function extends that selection and does
not verify that it belongs to the supplied input. Do not mutate the bytes or
selection while the operation is in progress. Decode its output using the
async decoder. Run candidate search in a Worker if responsiveness or
cancellation matters.
