// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
export type NativeCompressionFormat = "deflate-raw" | "brotli";
type Direction = "compress" | "decompress";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = MAX_INPUT_BYTES + 64 * 1024;
const INPUT_CHUNK_BYTES = 16 * 1024;

export interface NativeCompressionOptions {
  signal?: AbortSignal;
  /** Upper bound is 4 MiB + 64 KiB for compression and 4 MiB for decompression; can be narrowed further. */
  maxOutputBytes?: number;
}

export class NativeCompressionUnavailableError extends Error {
  constructor(readonly format: NativeCompressionFormat, readonly direction: Direction) {
    super(`This runtime does not support ${format} ${direction}.`);
    this.name = "NativeCompressionUnavailableError";
  }
}

export class NativeCompressionLimitError extends Error {
  constructor(readonly maximum: number) {
    super(`圧縮データの処理結果が上限${maximum.toLocaleString()} Bを超えています。`);
    this.name = "NativeCompressionLimitError";
  }
}

function createStream(format: NativeCompressionFormat, direction: Direction) {
  const Constructor = direction === "compress" ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (typeof Constructor !== "function") throw new NativeCompressionUnavailableError(format, direction);
  try {
    // brotli is in the WHATWG spec, but TypeScript DOM types and browser support may lag behind.
    return new Constructor(format as CompressionFormat);
  } catch {
    throw new NativeCompressionUnavailableError(format, direction);
  }
}

/** Checks compress and decompress support separately. Only formats that support both are used as new output candidates. */
export function nativeCompressionSupport(format: NativeCompressionFormat): { compress: boolean; decompress: boolean } {
  const supports = (direction: Direction) => {
    try {
      const stream = createStream(format, direction);
      void stream.readable.cancel().catch(() => {});
      void stream.writable.abort().catch(() => {});
      return true;
    } catch {
      return false;
    }
  };
  return { compress: supports("compress"), decompress: supports("decompress") };
}

function abortError(): DOMException {
  return new DOMException("圧縮データの処理を中止しました。", "AbortError");
}

async function transformNative(
  input: Uint8Array,
  format: NativeCompressionFormat,
  direction: Direction,
  options: NativeCompressionOptions,
  collectOutput = true,
): Promise<Uint8Array> {
  const maximumInput = direction === "compress" ? MAX_INPUT_BYTES : MAX_COMPRESSED_BYTES;
  if (input.byteLength > maximumInput) throw new NativeCompressionLimitError(maximumInput);
  const maximumOutput = direction === "compress" ? MAX_COMPRESSED_BYTES : MAX_INPUT_BYTES;
  const limit = options.maxOutputBytes ?? maximumOutput;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > maximumOutput) {
    throw new RangeError(`出力上限は0〜${maximumOutput.toLocaleString()} Bで指定してください。`);
  }
  if (options.signal?.aborted) throw abortError();

  const stream = createStream(format, direction);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const stop = (reason: unknown) => {
    void reader.cancel(reason).catch(() => {});
    void writer.abort(reason).catch(() => {});
  };
  const onAbort = () => stop(abortError());
  options.signal?.addEventListener("abort", onAbort, { once: true });

  // Without concurrent reading, stream backpressure will cause writes to block indefinitely.
  const writing = (async () => {
    for (let offset = 0; offset < input.length; offset += INPUT_CHUNK_BYTES) {
      if (options.signal?.aborted) throw abortError();
      await writer.write(new Uint8Array(input.subarray(offset, offset + INPUT_CHUNK_BYTES)));
    }
    await writer.close();
  })();
  const reading = (async () => {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (options.signal?.aborted) throw abortError();
      if (done) break;
      if (value.byteLength > limit - length) throw new NativeCompressionLimitError(limit);
      if (collectOutput) chunks.push(value);
      length += value.byteLength;
    }
    if (!collectOutput) return new Uint8Array();
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  })();

  try {
    const [, result] = await Promise.all([writing, reading]);
    if (options.signal?.aborted) throw abortError();
    return result;
  } catch (cause) {
    stop(cause);
    // Even after one side fails, collect the other side's rejection before releasing locks.
    await Promise.allSettled([writing, reading]);
    if (options.signal?.aborted) throw abortError();
    throw cause;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    writer.releaseLock();
    reader.releaseLock();
  }
}

/** Browser-provided compression. Quality settings and output consistency across implementations are not guaranteed. */
export function compressNative(
  input: Uint8Array,
  format: NativeCompressionFormat,
  options: NativeCompressionOptions = {},
): Promise<Uint8Array> {
  return transformNative(input, format, "compress", options);
}

/**
 * Instead of using Response.arrayBuffer() after full decompression, checks the output limit on each read.
 * Also verifies that input with the final byte removed cannot be decompressed, for deflate-raw and brotli.
 * This handles implementations that silently ignore extra trailing data, unlike WHATWG spec §3.
 * CRC and exact length verification are left to the caller's storage format.
 */
export async function decompressNative(
  input: Uint8Array,
  format: NativeCompressionFormat,
  options: NativeCompressionOptions = {},
): Promise<Uint8Array> {
  const result = await transformNative(input, format, "decompress", options);
  if (format === "deflate-raw" || format === "brotli") {
    let shortenedIsComplete = false;
    try {
      // The final byte containing the proper terminator is required. If decompression still succeeds without it, all trailing bytes were superfluous.
      // Apply the same output limit during the check, and avoid holding the decompressed bytes twice.
      await transformNative(input.subarray(0, input.length - 1), format, "decompress", options, false);
      shortenedIsComplete = true;
    } catch (cause) {
      if (
        options.signal?.aborted ||
        cause instanceof NativeCompressionUnavailableError ||
        cause instanceof NativeCompressionLimitError ||
        (typeof cause === "object" && cause !== null && "name" in cause && cause.name === "AbortError")
      ) throw cause;
      // The expected behavior is for the stream to be incomplete after the trailing byte is removed.
    }
    if (shortenedIsComplete) throw new TypeError(`${format}の終端後に余分なデータがあります。`);
  }
  return result;
}
