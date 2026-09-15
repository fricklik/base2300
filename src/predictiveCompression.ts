// Extracted from an earlier private project by the same author; see NOTICE for license provenance.
/**
 * PC1: fixed-model prediction of byte sequences with adaptive arithmetic coding over a 32-bit integer interval.
 * No word dictionary, pre-trained model, or random numbers are used; state is reset to the same initial value at the start of each input.
 * Leading byte: 0x10=order0, 0x11=order1, 0x13=order3, 0x18=uncompressed store.
 * Next is the minimal LEB128 of the original byte length; the remainder is the MSB-first arithmetic code (trailing byte zero-padded) or the original byte sequence.
 * If the predicted body is at least as large as the original byte count, data is stored uncompressed; the maximum size of a compression candidate is limited to original-byte-count + 5.
 * When changing the model, update order, rounding, or termination rules, increment the format version.
 * Arithmetic coding foundation: Witten/Neal/Cleary, Arithmetic Coding for Data Compression (1987).
 * This format does not include a CRC; corruption detection should be combined with a CRC of the original byte sequence on the storage side.
 */
export const MAX_PREDICTIVE_BYTES = 4 * 1024 * 1024;
export const MAX_PREDICTIVE_PAYLOAD_BYTES = MAX_PREDICTIVE_BYTES + 5;
export const PREDICTIVE_MODELS = [0, 1, 3] as const;
export type PredictiveModel = typeof PREDICTIVE_MODELS[number];

const HALF = 0x80000000;
const QUARTER = 0x40000000;
const THREE_QUARTERS = 0xc0000000;
const SCALE = 4096;
const HASH_SIZE = 1 << 18;
const HASH_MASK = HASH_SIZE - 1;
const STORED = 0x18;
const USE_STORED = Symbol("predictive stored fallback");

/**
 * order0: bit prefix of already-read bits for the current byte. order1: previous byte + bit prefix.
 * order3: hashes the previous 3 bytes into 262144 fixed nodes, combined with the bit prefix.
 * Falls back to the lower-order model with weight 4/8, so probability is defined even for unseen contexts.
 * Halves each count to ceil(n/2) when the total count reaches 512. Probability is truncated to 12 bits, clamped to 1..4095.
 * Even for order3, the count arrays are fixed at approximately 1.25 MiB. Hash collisions are handled identically by both sides.
 */
class Predictor {
  private readonly globalZero = new Uint16Array(256).fill(1);
  private readonly globalOne = new Uint16Array(256).fill(1);
  private readonly contextZero: Uint16Array;
  private readonly contextOne: Uint16Array;
  private readonly hashedZero: Uint16Array;
  private readonly hashedOne: Uint16Array;
  private prefix = 1;
  private history = 0;
  private hash = 0;
  private contextIndex = 0;
  private hashedIndex = 0;

  constructor(private readonly model: PredictiveModel) {
    this.contextZero = new Uint16Array(model >= 1 ? 65_536 : 0);
    this.contextOne = new Uint16Array(model >= 1 ? 65_536 : 0);
    this.hashedZero = new Uint16Array(model >= 3 ? HASH_SIZE : 0);
    this.hashedOne = new Uint16Array(model >= 3 ? HASH_SIZE : 0);
  }

  probability(): number {
    const prefix = this.prefix;
    const zero = this.globalZero[prefix]!;
    let probability = Math.floor(SCALE * zero / (zero + this.globalOne[prefix]!));
    if (this.model >= 1) {
      const index = ((this.history & 255) << 8) | prefix;
      this.contextIndex = index;
      const contextZero = this.contextZero[index]!;
      probability = Math.floor((SCALE * contextZero + 4 * probability) / (contextZero + this.contextOne[index]! + 4));
    }
    if (this.model >= 3) {
      const index = (this.hash ^ Math.imul(prefix, 0x85ebca6b)) & HASH_MASK;
      this.hashedIndex = index;
      const hashedZero = this.hashedZero[index]!;
      probability = Math.floor((SCALE * hashedZero + 8 * probability) / (hashedZero + this.hashedOne[index]! + 8));
    }
    return Math.max(1, Math.min(SCALE - 1, probability));
  }

  private updateCounts(zero: Uint16Array, one: Uint16Array, index: number, bit: number): void {
    if (bit === 0) zero[index] = zero[index]! + 1;
    else one[index] = one[index]! + 1;
    if (zero[index]! + one[index]! >= 512) {
      zero[index] = (zero[index]! + 1) >>> 1;
      one[index] = (one[index]! + 1) >>> 1;
    }
  }

  update(bit: number): void {
    this.updateCounts(this.globalZero, this.globalOne, this.prefix, bit);
    if (this.model >= 1) this.updateCounts(this.contextZero, this.contextOne, this.contextIndex, bit);
    if (this.model >= 3) this.updateCounts(this.hashedZero, this.hashedOne, this.hashedIndex, bit);
    this.prefix = (this.prefix << 1) | bit;
    if (this.prefix >= 256) {
      this.history = ((this.history << 8) | (this.prefix & 255)) & 0xffffff;
      this.prefix = 1;
      const hash = Math.imul(this.history, 0x9e3779b1) >>> 0;
      this.hash = hash ^ (hash >>> 16);
    }
  }
}

class BitWriter {
  private bytes: Uint8Array;
  private length = 0;
  private partial = 0;
  private partialBits = 0;

  constructor(private readonly maximum: number) {
    this.bytes = new Uint8Array(Math.min(4096, maximum));
  }

  private append(byte: number): void {
    if (this.length === this.maximum) throw USE_STORED;
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(Math.min(this.maximum, this.bytes.length * 2));
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = byte;
  }

  write(bit: number): void {
    this.partial = (this.partial << 1) | bit;
    if (++this.partialBits === 8) {
      this.append(this.partial);
      this.partial = 0;
      this.partialBits = 0;
    }
  }

  finish(): Uint8Array {
    if (this.partialBits > 0) this.append(this.partial << (8 - this.partialBits));
    return this.bytes.slice(0, this.length);
  }
}

function encodeBody(input: Uint8Array, model: PredictiveModel): Uint8Array {
  const predictor = new Predictor(model);
  const writer = new BitWriter(input.length - 1);
  let low = 0;
  let high = 0xffffffff;
  let pending = 0;
  const emit = (bit: number): void => {
    writer.write(bit);
    while (pending > 0) {
      writer.write(bit ^ 1);
      pending--;
    }
  };
  for (const byte of input) {
    for (let shift = 7; shift >= 0; shift--) {
      const bit = (byte >>> shift) & 1;
      // range <= 2^32, probability < 2^12; product is less than 2^44, within Number integer precision.
      const split = low + Math.floor((high - low + 1) * predictor.probability() / SCALE) - 1;
      if (bit === 0) high = split;
      else low = split + 1;
      for (;;) {
        if (high < HALF) emit(0);
        else if (low >= HALF) {
          emit(1);
          low -= HALF;
          high -= HALF;
        } else if (low >= QUARTER && high < THREE_QUARTERS) {
          pending++;
          low -= QUARTER;
          high -= QUARTER;
        } else break;
        low *= 2;
        high = high * 2 + 1;
      }
      predictor.update(bit);
    }
  }
  pending++;
  emit(low < QUARTER ? 0 : 1);
  return writer.finish();
}

function header(length: number, tag: number): Uint8Array {
  const bytes = [tag];
  do {
    const next = length % 128;
    length = Math.floor(length / 128);
    bytes.push(next | (length > 0 ? 128 : 0));
  } while (length > 0);
  return Uint8Array.from(bytes);
}

/** Resets prediction state per input and losslessly compresses with the selected model. */
export function compressPredictive(input: Uint8Array, model: PredictiveModel): Uint8Array {
  if (!PREDICTIVE_MODELS.includes(model)) throw new Error("未対応の予測モデルです。");
  if (input.length > MAX_PREDICTIVE_BYTES) throw new Error("予測圧縮の入力は 4 MiB 以下にしてください。");
  let body = input;
  let tag = STORED;
  if (input.length > 0) {
    try {
      body = encodeBody(input, model);
      tag = 0x10 | model;
    } catch (error) {
      if (error !== USE_STORED) throw error;
    }
  }
  const prefix = header(input.length, tag);
  const output = new Uint8Array(prefix.length + body.length);
  output.set(prefix);
  output.set(body, prefix.length);
  return output;
}

class BitReader {
  private position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  read(): number {
    const position = this.position++;
    if (position >= this.bytes.length * 8) {
      // Up to 30 virtual zero bits may follow the standard arithmetic terminator; unlimited zero padding is not applied.
      if (position - this.bytes.length * 8 >= 30) throw new Error("予測圧縮データが途中で終わっています。");
      return 0;
    }
    return (this.bytes[position >>> 3]! >>> (7 - (position & 7))) & 1;
  }
}

function decodeBody(body: Uint8Array, length: number, model: PredictiveModel): Uint8Array {
  const reader = new BitReader(body);
  const predictor = new Predictor(model);
  const output = new Uint8Array(length);
  let low = 0;
  let high = 0xffffffff;
  let code = 0;
  for (let index = 0; index < 32; index++) code = code * 2 + reader.read();
  for (let index = 0; index < length; index++) {
    let byte = 0;
    for (let shift = 7; shift >= 0; shift--) {
      const split = low + Math.floor((high - low + 1) * predictor.probability() / SCALE) - 1;
      const bit = code > split ? 1 : 0;
      if (bit === 0) high = split;
      else low = split + 1;
      for (;;) {
        if (high < HALF) {
          // Lower half: no offset adjustment needed.
        } else if (low >= HALF) {
          low -= HALF;
          high -= HALF;
          code -= HALF;
        } else if (low >= QUARTER && high < THREE_QUARTERS) {
          low -= QUARTER;
          high -= QUARTER;
          code -= QUARTER;
        } else break;
        low *= 2;
        high = high * 2 + 1;
        code = code * 2 + reader.read();
      }
      byte = (byte << 1) | bit;
      predictor.update(bit);
    }
    output[index] = byte;
  }
  return output;
}

/**
 * Strictly validates the decoded length, format, and trailer. maxOutputBytes adds an additional limit below the default 4 MiB.
 * Re-compresses the arithmetic data with the same model and verifies every byte, rejecting extra trailing data and non-canonical padding.
 * Decoding and re-compression scale with input length; model memory and output size are bounded.
 */
export function decompressPredictive(payload: Uint8Array, maxOutputBytes = MAX_PREDICTIVE_BYTES): Uint8Array {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0 || maxOutputBytes > MAX_PREDICTIVE_BYTES) {
    throw new Error("予測圧縮の復元上限が不正です。");
  }
  if (payload.length < 2 || payload.length > MAX_PREDICTIVE_PAYLOAD_BYTES) throw new Error("予測圧縮データの長さが不正です。");
  const tag = payload[0]!;
  if (tag !== STORED && tag !== 0x10 && tag !== 0x11 && tag !== 0x13) throw new Error("未対応の予測圧縮形式です。");
  let length = 0;
  let scale = 1;
  let position = 1;
  for (;;) {
    if (position >= payload.length || position > 4) throw new Error("予測圧縮データの元サイズが不正です。");
    const byte = payload[position++]!;
    length += (byte & 127) * scale;
    if (length > maxOutputBytes) throw new Error("予測圧縮の復元結果が上限を超えています。");
    if ((byte & 128) === 0) {
      if (position > 2 && byte === 0) throw new Error("予測圧縮の元サイズに余分な先頭桁があります。");
      break;
    }
    scale *= 128;
  }
  const body = payload.subarray(position);
  if (tag === STORED) {
    if (body.length !== length) throw new Error("予測圧縮の無圧縮データ長が一致しません。");
    return body.slice();
  }
  if (body.length === 0 || body.length >= length) throw new Error("予測圧縮の算術データ長が不正です。");
  const model = (tag & 15) as PredictiveModel;
  const output = decodeBody(body, length, model);
  const canonical = compressPredictive(output, model);
  if (canonical.length !== payload.length || canonical.some((byte, index) => byte !== payload[index])) {
    throw new Error("予測圧縮データの終端または内容が不正です。");
  }
  return output;
}
