/**
 * Experimental profiles preserve the original implementation's portable wire formats.
 * The advanced encoder selects by Unicode code-point count and normally omits CRC32.
 * Minimal framing has no integrity check. Never assume a successful decode proves no corruption.
 * Native compression support depends on the runtime's CompressionStream implementation.
 */
export {
  encodeBase2300Advanced,
  decodeBase2300Advanced,
  decodeBase2300AdvancedAsync,
  extendBase2300WithNative,
  isBase2300,
  LLM_MARKER,
  UnsupportedBase2300FormatError,
  type Base2300Effort,
  type Base2300Selection,
  type CompressionTrial,
} from "./base2300Advanced.js";
export {
  isMinimalBase2300,
  countMinimalBase2300Characters,
  packMinimalBase2300Frame,
  minimizeBase2300Frame,
  expandMinimalBase2300Frame,
} from "./minimalBase2300.js";
export { encodeShortUnicode, decodeShortUnicode, SHORT_UNICODE_PRESETS, type ShortUnicodePreset } from "./shortUnicodeCompression.js";
export { compressPredictive, decompressPredictive, PREDICTIVE_MODELS, MAX_PREDICTIVE_BYTES, type PredictiveModel } from "./predictiveCompression.js";
export {
  compressNative,
  decompressNative,
  nativeCompressionSupport,
  NativeCompressionLimitError,
  NativeCompressionUnavailableError,
  type NativeCompressionFormat,
  type NativeCompressionOptions,
} from "./nativeCompression.js";
export { toUnicodeUnits, fromUnicodeUnits } from "./unicodePrecondition.js";
export { packBase2300Frame, unpackBase2300Frame } from "./base2300.js";
