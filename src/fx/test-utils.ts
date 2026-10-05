// Helpers for rendering one effect in Node (node-web-audio-api). Test-only.
import { createRng, type EffectModule, type Params } from '../core';
import { createTestContext } from '../test/audio';

export const SR = 48000;

/** 60 ms of a 440 Hz tone with a sharp onset and a short fade, peaking at 0.8. */
export function testSignal(seconds = 0.06, freq = 440, amp = 0.8): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const fade = Math.round(0.005 * SR);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, (n - i) / fade);
    out[i] = amp * env * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return out;
}

export interface EffectRender {
  left: Float32Array;
  right: Float32Array;
}

/** Render `input` through one effect instance; optionally call `update` before rendering. */
export async function renderEffect(
  mod: EffectModule,
  params: Params,
  opts: { input?: Float32Array; seconds?: number; seed?: number; update?: Params; settleMs?: number } = {},
): Promise<EffectRender> {
  const input = opts.input ?? testSignal();
  const ctx = createTestContext(2, Math.round((opts.seconds ?? 0.5) * SR), SR);
  const buf = ctx.createBuffer(1, input.length, SR);
  buf.copyToChannel(input as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const fx = mod.create(ctx, params, createRng(opts.seed ?? 1));
  src.connect(fx.input);
  fx.output.connect(ctx.destination);
  if (opts.update) fx.update(opts.update);
  // Debounced live work (reverb IR regeneration) runs on timers before rendering starts.
  if (opts.settleMs) await new Promise((r) => setTimeout(r, opts.settleMs));
  src.start(0);
  const out = await ctx.startRendering();
  fx.dispose();
  // Copy out: node-web-audio-api's channel data can alias native memory that is reused once
  // the buffer is collected, which silently changed earlier renders under load.
  return { left: out.getChannelData(0).slice(), right: out.getChannelData(1).slice() };
}

export function peakOf(...chs: Float32Array[]): number {
  let p = 0;
  for (const ch of chs) for (const v of ch) p = Math.max(p, Math.abs(v));
  return p;
}

export function rms(ch: Float32Array, from = 0, to = ch.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += ch[i]! * ch[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

/** RMS of the difference between two signals over the shorter length. */
export function diffRms(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s / n);
}

export const isFinite32 = (ch: Float32Array) => ch.every((v) => Number.isFinite(v));
