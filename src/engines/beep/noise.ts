import { createRng } from '../../core';

/** Clock of the chip noise LFSR at playback rate 1 (played note 60). */
export const CHIP_CLOCK = 8000;

/** White noise, ±1, from a fixed seed so every render of a patch is identical. */
export function whiteNoise(length: number, seed = 0x5eed): Float32Array {
  const rng = createRng(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

/** Pink (-3 dB/oct) noise via Paul Kellet's economy filter, normalised to peak 1. */
export function pinkNoise(length: number, seed = 0x91c): Float32Array {
  const white = whiteNoise(length, seed);
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const w = white[i]!;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    const v = b0 + b1 + b2 + w * 0.1848;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < length; i++) out[i] = out[i]! / peak;
  return out;
}

/**
 * 1-bit noise from a 15-bit LFSR, the way 8-bit consoles made it. `short` taps bit 6 for the
 * metallic, pitched 93-step loop; otherwise the full 32767-step sequence. Each LFSR step is held
 * for `hold` samples, and the buffer is exactly a whole number of periods so it loops seamlessly.
 */
export function chipNoise(hold: number, short: boolean): Float32Array {
  const stepsLen = short ? 93 * 8 : 32767;
  const out = new Float32Array(stepsLen * hold);
  let reg = 1;
  for (let s = 0; s < stepsLen; s++) {
    const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
    reg = (reg >> 1) | (bit << 14);
    const v = reg & 1 ? -0.8 : 0.8;
    out.fill(v, s * hold, (s + 1) * hold);
  }
  return out;
}

const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

export function getNoiseBuffer(ctx: BaseAudioContext, type: string): AudioBuffer {
  let map = cache.get(ctx);
  if (!map) cache.set(ctx, (map = new Map()));
  let buf = map.get(type);
  if (!buf) {
    const sr = ctx.sampleRate;
    const hold = Math.max(1, Math.round(sr / CHIP_CLOCK));
    const data =
      type === 'pink'
        ? pinkNoise(sr * 2)
        : type === 'chip'
          ? chipNoise(hold, false)
          : type === 'chip-metal'
            ? chipNoise(hold, true)
            : whiteNoise(sr * 2);
    buf = ctx.createBuffer(1, data.length, sr);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    map.set(type, buf);
  }
  return buf;
}
