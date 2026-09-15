// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
import {
  crc32, decodeBase2300, encodeBase2300Binary, encodeBase2300Text, getBase2300Mode, MAX_BASE2300_BYTES,
  unpackBase2300Frame,
} from "./base2300.js";
import { compressPredictive, decompressPredictive, PREDICTIVE_MODELS } from "./predictiveCompression.js";
import {
  compressNative, decompressNative, nativeCompressionSupport,
  NativeCompressionLimitError, NativeCompressionUnavailableError,
  type NativeCompressionFormat,
} from "./nativeCompression.js";
import { fromUnicodeUnits, toUnicodeUnits } from "./unicodePrecondition.js";
import { decodeShortUnicode, encodeShortUnicode } from "./shortUnicodeCompression.js";
import {
  countMinimalBase2300Characters, expandMinimalBase2300Frame, isMinimalBase2300,
  minimizeBase2300Frame, packMinimalBase2300Frame,
} from "./minimalBase2300.js";

export interface CompressionTrial {
  id: string;
  label: string;
  characters: number | null;
  milliseconds: number;
  status: "ok" | "unavailable" | "limit" | "skipped";
}
export interface Base2300Selection {
  text: string;
  selectedId: string;
  trials: CompressionTrial[];
  /** Minimal profiles omit a checksum; callers must preserve the text exactly. */
  integrity: "crc32" | "none";
  experimental: true;
}
export type Base2300Effort = "fast" | "full";

const FULL_PREDICTIVE_MAX_BYTES = 16 * 1024;
const FAST_PREDICTIVE_MAX_BYTES = 128 * 1024;

// Each identifier is a single kana character within the alphabet, also encoding a fixed scheme and preprocessing specification.
const PREDICTIVE_MARKER = "い";
/** Reserved legacy marker; this portable package cannot decode model-dependent LLM frames. */
export const LLM_MARKER = "き";

export class UnsupportedBase2300FormatError extends Error {
  constructor() {
    super("Legacy LLM Base2300 frames (き) require an external model profile and are not supported by this portable package.");
    this.name = "UnsupportedBase2300FormatError";
  }
}
const NATIVE_MARKERS: Record<NativeCompressionFormat, string> = { "deflate-raw": "う", brotli: "え" };
const MARKERS = new Set(["あ", "ア", "お", "か", PREDICTIVE_MARKER, LLM_MARKER, ...Object.values(NATIVE_MARKERS)]);

export function isBase2300(text: string): boolean { return MARKERS.has(text[0] ?? "") || isMinimalBase2300(text); }

function countCharacters(text: string): number {
  let count = 0;
  for (const _character of text) count++;
  return count;
}

function checkInput(bytes: Uint8Array): void {
  if (bytes.length > MAX_BASE2300_BYTES) throw new Error("入力データは 4 MiB 以下にしてください。");
}

function representations(bytes: Uint8Array): { bytes: Uint8Array; transform: 0 | 1; label: string }[] {
  const result: { bytes: Uint8Array; transform: 0 | 1; label: string }[] = [{ bytes, transform: 0, label: "" }];
  const units = toUnicodeUnits(bytes);
  if (units !== null) result.push({ bytes: units, transform: 1, label: "＋Unicode文字単位" });
  return result;
}

function addCandidate(
  selection: Base2300Selection, compressed: Uint8Array, transform: 0 | 1,
  marker: string, trial: Omit<CompressionTrial, "characters" | "status">,
): void {
  const started = performance.now();
  if (compressed.length + 1 > MAX_BASE2300_BYTES) {
    selection.trials.push({ ...trial, characters: null, status: "limit" });
    return;
  }
  const characters = countMinimalBase2300Characters((compressed.length + 1) * 8);
  const selected = selection.trials.find((entry) => entry.id === selection.selectedId)!;
  // When counts are equal, keep the previously evaluated candidate to avoid adding unnecessary dependencies on older formats.
  if (characters < selected.characters!) {
    const payload = new Uint8Array(compressed.length + 1);
    payload[0] = transform;
    payload.set(compressed, 1);
    selection.text = packMinimalBase2300Frame(payload, marker);
    selection.selectedId = trial.id;
  }
  selection.trials.push({ ...trial, label: `${trial.label}（CRCなし）`, characters,
    milliseconds: trial.milliseconds + performance.now() - started, status: "ok" });
}

/**
 * Lossless compression that runs without a shared model. full compares all predictive models.
 * fast also retains candidates for short inputs, but limits predictive computation for larger inputs.
 */
export function encodeBase2300Advanced(bytes: Uint8Array, effort: Base2300Effort = "full"): Base2300Selection {
  checkInput(bytes);
  const started = performance.now();
  const binary = encodeBase2300Binary(bytes);
  const source = encodeBase2300Text(bytes);
  const text = source !== null && countCharacters(source) < countCharacters(binary) ? source : binary;
  const selection: Base2300Selection = {
    text, selectedId: "v1", integrity: "crc32", experimental: true, trials: [{ id: "v1", label: getBase2300Mode(text) === "text" ? "従来の文字種符号" : "従来のバイナリ符号",
      characters: countCharacters(text), milliseconds: performance.now() - started, status: "ok" }],
  };
  for (const [kind, wire] of [["binary", binary], ["text", source]] as const) {
    if (wire === null) continue;
    const start = performance.now();
    const minimal = kind === "binary" ? null : minimizeBase2300Frame(wire);
    const id = `v1-${kind}-minimal`;
    const characters = minimal === null ? countMinimalBase2300Characters(bytes.length * 8) : countCharacters(minimal);
    const current = selection.trials.find((trial) => trial.id === selection.selectedId)!;
    if (characters < current.characters!) {
      selection.text = minimal ?? packMinimalBase2300Frame(bytes, "ア");
      selection.selectedId = id;
    }
    selection.trials.push({ id, label: `${kind === "binary" ? "バイナリの数値化" : "従来の文字種符号"}（CRCなし）`,
      characters, milliseconds: performance.now() - start, status: "ok" });
  }
  for (const preset of ["mixed", "japanese"] as const) {
    const start = performance.now();
    const checkedCandidate = encodeShortUnicode(bytes, preset);
    if (checkedCandidate === null) continue;
    const candidate = minimizeBase2300Frame(checkedCandidate);
    const characters = countCharacters(candidate);
    const id = `short-${preset}`;
    const current = selection.trials.find((trial) => trial.id === selection.selectedId)!;
    selection.trials.push({ id, label: preset === "mixed" ? "かなを優先する文字種符号（CRCなし）" : "日本語の文字種符号（CRCなし）",
      characters, milliseconds: performance.now() - start, status: "ok" });
    if (characters < current.characters!) { selection.text = candidate; selection.selectedId = id; }
  }
  for (const source of representations(bytes)) {
    for (const model of PREDICTIVE_MODELS) {
      const trial = { id: `predictive-${model}-${source.transform}`, label: `予測圧縮 order${model}${source.label}` };
      if (effort === "fast" && bytes.length > FULL_PREDICTIVE_MAX_BYTES
        && (model !== 1 || source.bytes.length > FAST_PREDICTIVE_MAX_BYTES)) {
        selection.trials.push({ ...trial, label: `${trial.label}（速度優先で省略）`, characters: null, milliseconds: 0, status: "skipped" });
        continue;
      }
      const start = performance.now();
      const compressed = compressPredictive(source.bytes, model);
      addCandidate(selection, compressed, source.transform, PREDICTIVE_MARKER, {
        ...trial,
        milliseconds: performance.now() - start,
      });
    }
  }
  selection.integrity = isMinimalBase2300(selection.text) ? "none" : "crc32";
  return selection;
}

/** In supporting browsers, also adds standard dictionary/back-reference compression, then selects by total character count. */
export async function extendBase2300WithNative(
  bytes: Uint8Array, previous: Base2300Selection, signal?: AbortSignal,
): Promise<Base2300Selection> {
  checkInput(bytes);
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const selection: Base2300Selection = { ...previous, trials: [...previous.trials] };
  const sources = representations(bytes);
  for (const format of ["deflate-raw", "brotli"] as const) {
    const support = nativeCompressionSupport(format);
    if (!support.compress || !support.decompress) {
      selection.trials.push({ id: format, label: format === "brotli" ? "Brotli" : "DEFLATE", characters: null, milliseconds: 0, status: "unavailable" });
      continue;
    }
    for (const source of sources) {
      const started = performance.now();
      const trial = { id: `${format}-${source.transform}`, label: `${format === "brotli" ? "Brotli" : "DEFLATE"}${source.label}` };
      try {
        const compressed = await compressNative(source.bytes, format, { signal, maxOutputBytes: MAX_BASE2300_BYTES - 1 });
        addCandidate(selection, compressed, source.transform, NATIVE_MARKERS[format], {
          ...trial, milliseconds: performance.now() - started,
        });
      } catch (cause) {
        if (!(cause instanceof NativeCompressionLimitError) && !(cause instanceof NativeCompressionUnavailableError)) throw cause;
        selection.trials.push({ ...trial, characters: null, milliseconds: performance.now() - started,
          status: cause instanceof NativeCompressionLimitError ? "limit" : "unavailable" });
      }
    }
  }
  selection.integrity = isMinimalBase2300(selection.text) ? "none" : "crc32";
  return selection;
}

function frameSource(text: string) {
  const { payload, checksum } = unpackBase2300Frame(text);
  const transform = payload[0];
  if (transform !== 0 && transform !== 1) throw new Error("Base2300の前処理の版が不正です。");
  return { compressed: payload.subarray(1), transform, checksum };
}

function restoreSource(bytes: Uint8Array, transform: number, checksum: number, verifyChecksum: boolean): Uint8Array {
  const original = transform === 1 ? fromUnicodeUnits(bytes, MAX_BASE2300_BYTES) : bytes;
  checkInput(original);
  if (verifyChecksum && crc32(original) !== checksum) throw new Error("チェックサムが一致しません。Base2300のデータが変わっています。");
  return original;
}

function decodeStructure(text: string, verifyChecksum: boolean): Uint8Array {
  if (text.startsWith(LLM_MARKER)) throw new UnsupportedBase2300FormatError();
  if (text.startsWith("あ") || text.startsWith("ア")) return decodeBase2300(text, verifyChecksum);
  if (text.startsWith("お") || text.startsWith("か")) return decodeShortUnicode(text, verifyChecksum);
  if (!text.startsWith(PREDICTIVE_MARKER)) throw new Error("このBase2300形式は非同期の復元処理が必要です。");
  const frame = frameSource(text);
  return restoreSource(decompressPredictive(frame.compressed), frame.transform, frame.checksum, verifyChecksum);
}

export function decodeBase2300Advanced(text: string): Uint8Array {
  const minimal = isMinimalBase2300(text);
  return decodeStructure(minimal ? expandMinimalBase2300Frame(text) : text, !minimal);
}

export async function decodeBase2300AdvancedAsync(text: string, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const minimal = isMinimalBase2300(text);
  const wire = minimal ? expandMinimalBase2300Frame(text) : text;
  if (wire.startsWith(LLM_MARKER)) throw new UnsupportedBase2300FormatError();
  const format = (Object.entries(NATIVE_MARKERS) as [NativeCompressionFormat, string][]).find(([, marker]) => wire.startsWith(marker))?.[0];
  if (!format) return decodeStructure(wire, !minimal);
  const frame = frameSource(wire);
  const bytes = await decompressNative(frame.compressed, format, { signal, maxOutputBytes: MAX_BASE2300_BYTES });
  return restoreSource(bytes, frame.transform, frame.checksum, !minimal);
}
