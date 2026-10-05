/**
 * Placeholder sample library generator.
 *
 * The real OpenClick library will be recorded. Until it exists, this script synthesises
 * mechanical sounds (switches, keys, cameras, toys, control panels) with simple modal synthesis:
 * every "impact" is a handful of exponentially decaying sine modes plus a filtered noise burst,
 * which is roughly how small plastic and metal parts ring when they hit each other. Each sound
 * gets several round robin variations by jittering frequencies, decays, timings and levels.
 *
 * Output: mono 48 kHz 16-bit WAVs under `public/samples/<category>/`, and the manifest at
 * `src/engines/click/manifest.json` (the engine bundles it to build its sound list; Vite does not
 * allow importing JSON from public/). Everything is deterministic, so re-running produces
 * identical files. Run with:
 *
 *   node scripts/samples/generate.ts
 *
 * This file has no relative imports so Node can run it directly (type stripping).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_RATE = 48000;
export const VARIATIONS = 4;
/** Peak level every sample is normalised to before round robin level jitter (-3 dBFS). */
const PEAK = 0.708;

// ---------------------------------------------------------------------------------------------
// Manifest format (shared with src/engines/click/library.ts; keep the two in sync)

export interface SampleManifest {
  format: 'openclick-samples';
  version: 1;
  name: string;
  /** True while the library is synthesised stand-ins rather than recordings. */
  placeholder: boolean;
  license: string;
  categories: SampleCategory[];
}

export interface SampleCategory {
  id: string;
  name: string;
  sounds: SampleSound[];
}

export interface SampleSound {
  id: string;
  name: string;
  placeholder: boolean;
  /** Where the audio came from: a URL for third-party CC0 audio, or how it was made. */
  source: string;
  license: string;
  /** Round robin variations, paths relative to public/samples/. */
  files: string[];
}

// ---------------------------------------------------------------------------------------------
// DSP

/** mulberry32, same algorithm as core's createRng (inlined so this script runs standalone). */
function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** RBJ biquad, direct form I. */
function biquad(type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q: number) {
  const w = (2 * Math.PI * Math.min(freq, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  return (x: number) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

interface Mode {
  /** Hz */
  f: number;
  /** Decay time constant, seconds. */
  tau: number;
  amp: number;
}

interface NoiseSpec {
  type: 'lowpass' | 'highpass' | 'bandpass';
  freq: number;
  q?: number;
  /** Decay time constant, seconds. */
  tau: number;
  gain: number;
  /** Optional linear fade-in (friction rather than impact). */
  attack?: number;
  /** Hard length limit, seconds. Default 8 × tau. */
  dur?: number;
}

/** One synthesis run for one variation. Jitter helpers draw from the variation's own seed. */
class Voice {
  readonly data: Float32Array;
  readonly rand: () => number;

  constructor(seconds: number, seed: number) {
    this.data = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
    this.rand = rngFrom(seed);
  }

  /** `x` scaled by a random factor within ±`amount` (fraction). */
  j(x: number, amount = 0.04): number {
    return x * (1 + (this.rand() * 2 - 1) * amount);
  }

  /** Uniform in [lo, hi). */
  r(lo: number, hi: number): number {
    return lo + this.rand() * (hi - lo);
  }

  modes(t0: number, modes: Mode[], gain = 1): void {
    const start = Math.round(t0 * SAMPLE_RATE);
    for (const m of modes) {
      const f = this.j(m.f, 0.03);
      const tau = this.j(m.tau, 0.1);
      const amp = this.j(m.amp, 0.1) * gain;
      const n = Math.min(this.data.length - start, Math.ceil(tau * 7 * SAMPLE_RATE));
      const phase = this.rand() * 0.3;
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        this.data[start + i]! += amp * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t + phase);
      }
    }
  }

  noise(t0: number, spec: NoiseSpec, gain = 1): void {
    const start = Math.round(t0 * SAMPLE_RATE);
    const filter = biquad(spec.type, this.j(spec.freq, 0.08), spec.q ?? 0.9);
    const tau = this.j(spec.tau, 0.15);
    const attack = spec.attack ?? 0;
    const dur = spec.dur ?? tau * 8 + attack;
    const n = Math.min(this.data.length - start, Math.ceil(dur * SAMPLE_RATE));
    const g = spec.gain * gain;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = attack > 0 && t < attack ? t / attack : Math.exp(-(t - attack) / tau);
      // Short fade at a hard length limit so frictions don't end in a click.
      const tailFade = Math.min(1, (n - i) / (0.002 * SAMPLE_RATE));
      this.data[start + i]! += g * env * tailFade * filter(this.rand() * 2 - 1);
    }
  }

  /** One mechanical impact: ringing body modes plus a noise transient. */
  hit(t0: number, modes: Mode[], noise: NoiseSpec, gain = 1): void {
    const g = this.j(gain, 0.12);
    this.modes(t0, modes, g);
    this.noise(t0, noise, g);
  }

  /** A swept tone with harmonics (squeaks, springs). `freq` and `amp` are functions of time. */
  sweep(
    t0: number,
    dur: number,
    freq: (t: number) => number,
    amp: (t: number) => number,
    harmonics: number[] = [1],
  ): void {
    const start = Math.round(t0 * SAMPLE_RATE);
    const n = Math.min(this.data.length - start, Math.ceil(dur * SAMPLE_RATE));
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      phase += (2 * Math.PI * freq(t)) / SAMPLE_RATE;
      let s = 0;
      harmonics.forEach((h, k) => (s += h * Math.sin(phase * (k + 1))));
      this.data[start + i]! += amp(t) * s;
    }
  }
}

/** DC block, normalise, trim trailing silence, fade the very end. */
export function finish(data: Float32Array, level: number): Float32Array {
  let x1 = 0,
    y1 = 0;
  const r = 1 - (2 * Math.PI * 20) / SAMPLE_RATE;
  for (let i = 0; i < data.length; i++) {
    const x = data[i]!;
    y1 = x - x1 + r * y1;
    x1 = x;
    data[i] = y1;
  }
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0 ? level / peak : 0;
  const threshold = level * Math.pow(10, -66 / 20);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    data[i]! *= scale;
    if (Math.abs(data[i]!) > threshold) last = i;
  }
  const fade = Math.floor(0.003 * SAMPLE_RATE);
  const out = data.slice(0, Math.min(data.length, last + fade + 1));
  for (let i = 0; i < fade && i < out.length; i++) out[out.length - 1 - i]! *= i / fade;
  return out;
}

/** Mono 16-bit PCM WAV. */
export function encodeWav16(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => {
    const c = Math.max(-1, Math.min(1, v));
    view.setInt16(44 + i * 2, Math.round(c < 0 ? c * 0x8000 : c * 0x7fff), true);
  });
  return bytes;
}

// ---------------------------------------------------------------------------------------------
// Recipes

interface Recipe {
  id: string;
  name: string;
  /** Render length before trimming, seconds. */
  seconds: number;
  build(v: Voice): void;
}

const plastic = (f: number, tau: number): Mode[] => [
  { f, tau, amp: 1 },
  { f: f * 1.63, tau: tau * 0.7, amp: 0.6 },
  { f: f * 2.71, tau: tau * 0.45, amp: 0.35 },
];
const metal = (f: number, tau: number): Mode[] => [
  { f, tau, amp: 1 },
  { f: f * 1.51, tau: tau * 0.9, amp: 0.7 },
  { f: f * 2.24, tau: tau * 0.8, amp: 0.5 },
  { f: f * 3.47, tau: tau * 0.6, amp: 0.3 },
];
const tick = (freq: number, tau = 0.0015, gain = 0.5): NoiseSpec => ({
  type: 'bandpass',
  freq,
  q: 1.2,
  tau,
  gain,
});
const thud = (freq: number, tau = 0.004, gain = 0.6): NoiseSpec => ({ type: 'lowpass', freq, tau, gain });

/** A ratchet: `count` small impacts, interval drifting by `accel` per tick. */
function ratchet(v: Voice, t0: number, count: number, interval: number, f: number, accel = 1): void {
  let t = t0;
  let dt = interval;
  for (let i = 0; i < count; i++) {
    v.hit(t, plastic(f, 0.003), tick(f * 1.4, 0.001, 0.6), v.r(0.6, 1));
    t += v.j(dt, 0.08);
    dt *= accel;
  }
}

export const LIBRARY: { id: string; name: string; recipes: Recipe[] }[] = [
  {
    id: 'switches',
    name: 'Switches',
    recipes: [
      {
        id: 'toggle',
        name: 'Toggle',
        seconds: 0.15,
        build(v) {
          v.hit(0, metal(2100, 0.012), tick(4200, 0.002, 0.7));
          v.hit(v.j(0.011, 0.15), metal(2400, 0.008), tick(5200), 0.35);
        },
      },
      {
        id: 'rocker',
        name: 'Rocker',
        seconds: 0.12,
        build(v) {
          v.hit(0, plastic(900, 0.012), thud(3000));
          v.hit(v.j(0.006, 0.2), plastic(1250, 0.008), tick(3800), 0.5);
        },
      },
      {
        id: 'push-button',
        name: 'Push button',
        seconds: 0.2,
        build(v) {
          v.hit(0, plastic(3000, 0.005), tick(5000, 0.0015, 0.8));
          v.hit(v.j(0.09, 0.1), plastic(3400, 0.004), tick(6000), 0.55);
        },
      },
      {
        id: 'slide',
        name: 'Slide',
        seconds: 0.14,
        build(v) {
          const slide = v.j(0.035, 0.2);
          v.noise(0, { type: 'bandpass', freq: 2200, q: 0.8, tau: 1, gain: 0.08, attack: 0.008, dur: slide });
          v.hit(slide, plastic(1600, 0.01), tick(4500, 0.002, 0.6));
        },
      },
      {
        id: 'rotary-detent',
        name: 'Rotary detent',
        seconds: 0.06,
        build(v) {
          v.hit(0, metal(4200, 0.003), { type: 'highpass', freq: 5000, tau: 0.001, gain: 0.5 });
        },
      },
      {
        id: 'light-switch',
        name: 'Light switch',
        seconds: 0.18,
        build(v) {
          v.hit(0, plastic(1200, 0.02), thud(2500, 0.006, 0.8));
          v.hit(v.j(0.004, 0.3), plastic(2600, 0.006), tick(5500), 0.5);
        },
      },
    ],
  },
  {
    id: 'keyboards',
    name: 'Keyboards',
    recipes: [
      {
        id: 'clicky-key',
        name: 'Clicky key',
        seconds: 0.22,
        build(v) {
          v.hit(0, metal(5000, 0.004), tick(6500, 0.0015, 0.8));
          v.hit(v.j(0.008, 0.2), plastic(420, 0.015), thud(2000, 0.005, 0.8), 0.9);
          v.hit(v.j(0.11, 0.15), plastic(1500, 0.006), tick(4200), 0.4);
        },
      },
      {
        id: 'linear-key',
        name: 'Linear key',
        seconds: 0.2,
        build(v) {
          v.hit(0, plastic(320, 0.018), thud(2500, 0.006, 0.9));
          v.hit(v.j(0.1, 0.15), plastic(900, 0.01), thud(3500, 0.003), 0.45);
        },
      },
      {
        id: 'spacebar',
        name: 'Spacebar',
        seconds: 0.28,
        build(v) {
          v.hit(0, plastic(190, 0.03), thud(1800, 0.008, 1));
          for (const t of [0.009, 0.016, 0.024]) v.hit(v.j(t, 0.15), metal(3200, 0.002), tick(5000), 0.15);
          v.hit(v.j(0.13, 0.12), plastic(600, 0.012), thud(2500, 0.004), 0.5);
        },
      },
      {
        id: 'laptop-key',
        name: 'Laptop key',
        seconds: 0.13,
        build(v) {
          v.hit(0, plastic(1500, 0.004), thud(4000, 0.002, 0.7));
          v.hit(v.j(0.07, 0.15), plastic(1900, 0.003), thud(5000, 0.0015), 0.4);
        },
      },
      {
        id: 'typewriter',
        name: 'Typewriter',
        seconds: 0.32,
        build(v) {
          v.hit(0, metal(1800, 0.025), tick(3000, 0.003, 0.9));
          v.hit(v.j(0.012, 0.15), plastic(240, 0.02), thud(1200, 0.006), 0.6);
          ratchet(v, v.j(0.06, 0.1), 2, 0.03, 2600);
        },
      },
      {
        id: 'enter-key',
        name: 'Enter key',
        seconds: 0.26,
        build(v) {
          v.hit(0, plastic(260, 0.024), thud(2200, 0.007, 1));
          v.hit(v.j(0.006, 0.3), metal(2800, 0.003), tick(4800), 0.25);
          v.hit(v.j(0.12, 0.12), plastic(700, 0.012), thud(3000, 0.004), 0.5);
        },
      },
    ],
  },
  {
    id: 'cameras',
    name: 'Cameras',
    recipes: [
      {
        id: 'slr-shutter',
        name: 'SLR shutter',
        seconds: 0.3,
        build(v) {
          v.hit(0, plastic(600, 0.02), thud(1800, 0.008, 0.9));
          v.hit(v.j(0.015, 0.1), metal(3600, 0.004), tick(6000, 0.0015, 0.9), 0.8);
          v.hit(v.j(0.06, 0.1), metal(3300, 0.004), tick(5500, 0.0015, 0.9), 0.7);
          v.hit(v.j(0.09, 0.1), plastic(520, 0.025), thud(1600, 0.01, 0.9), 0.9);
          v.noise(v.j(0.11, 0.1), { type: 'bandpass', freq: 900, q: 2, tau: 1, gain: 0.05, dur: 0.12 });
        },
      },
      {
        id: 'compact-shutter',
        name: 'Compact shutter',
        seconds: 0.1,
        build(v) {
          v.hit(0, metal(4200, 0.003), tick(6500, 0.001, 0.6));
          v.hit(v.j(0.022, 0.15), metal(3800, 0.003), tick(6000, 0.001, 0.6), 0.7);
        },
      },
      {
        id: 'film-advance',
        name: 'Film advance',
        seconds: 0.26,
        build(v) {
          v.noise(0, { type: 'bandpass', freq: 1400, q: 0.9, tau: 1, gain: 0.05, attack: 0.02, dur: 0.18 });
          ratchet(v, 0.01, 8, 0.02, 3100, 0.97);
        },
      },
      {
        id: 'lens-cap',
        name: 'Lens cap',
        seconds: 0.12,
        build(v) {
          v.hit(0, plastic(1100, 0.01), thud(3500, 0.003, 0.8));
          v.hit(v.j(0.005, 0.3), plastic(2300, 0.004), tick(5000), 0.4);
        },
      },
      {
        id: 'mode-dial',
        name: 'Mode dial',
        seconds: 0.07,
        build(v) {
          v.hit(0, metal(3500, 0.005), tick(6000, 0.001, 0.6));
        },
      },
    ],
  },
  {
    id: 'toys',
    name: 'Toys',
    recipes: [
      {
        id: 'squeaker',
        name: 'Squeaker',
        seconds: 0.3,
        build(v) {
          const f0 = v.j(950, 0.08);
          const dur = v.j(0.22, 0.12);
          v.sweep(
            0,
            dur,
            (t) =>
              f0 * (1 + 0.35 * Math.sin((Math.PI * t) / dur)) * (1 + 0.02 * Math.sin(2 * Math.PI * 28 * t)),
            (t) => 0.5 * Math.min(1, t / 0.012) * Math.min(1, (dur - t) / 0.03),
            [1, 0.5, 0.35, 0.15, 0.08],
          );
          v.noise(0, { type: 'bandpass', freq: 2500, q: 0.7, tau: 1, gain: 0.04, attack: 0.01, dur });
        },
      },
      {
        id: 'clicker',
        name: 'Clicker',
        seconds: 0.2,
        build(v) {
          v.hit(0, metal(2600, 0.012), tick(5000, 0.002, 0.8));
          v.hit(v.j(0.075, 0.15), metal(2900, 0.01), tick(5500, 0.002, 0.8), 0.75);
        },
      },
      {
        id: 'wind-up',
        name: 'Wind-up',
        seconds: 0.34,
        build(v) {
          ratchet(v, 0, 10, 0.028, 2300, 0.98);
        },
      },
      {
        id: 'spring',
        name: 'Spring',
        seconds: 0.6,
        build(v) {
          const f0 = v.j(260, 0.1);
          v.sweep(
            0,
            0.55,
            (t) => f0 * (0.75 + 0.25 * Math.exp(-t / 0.08)) * (1 + 0.04 * Math.sin(2 * Math.PI * 9 * t)),
            (t) => 0.6 * Math.min(1, t / 0.002) * Math.exp(-t / 0.12),
            [1, 0.25, 0.4, 0.1, 0.15],
          );
          v.hit(0, metal(1900, 0.006), tick(4000, 0.002, 0.5), 0.4);
        },
      },
      {
        id: 'rattle',
        name: 'Rattle',
        seconds: 0.24,
        build(v) {
          for (let i = 0; i < 14; i++) {
            v.hit(
              v.r(0, 0.17),
              plastic(v.r(2000, 5000), 0.003),
              tick(v.r(4000, 7000), 0.001, 0.5),
              v.r(0.2, 1),
            );
          }
        },
      },
    ],
  },
  {
    id: 'control-panels',
    name: 'Control panels',
    recipes: [
      {
        id: 'big-button',
        name: 'Big button',
        seconds: 0.25,
        build(v) {
          v.hit(0, plastic(250, 0.025), thud(1500, 0.008, 1));
          v.hit(v.j(0.004, 0.3), metal(2400, 0.005), tick(4500), 0.35);
          v.hit(v.j(0.13, 0.12), plastic(420, 0.015), thud(2000, 0.005), 0.5);
        },
      },
      {
        id: 'knob-detent',
        name: 'Knob detent',
        seconds: 0.06,
        build(v) {
          v.hit(0, metal(2800, 0.003), { type: 'highpass', freq: 4000, tau: 0.001, gain: 0.5 });
        },
      },
      {
        id: 'lever',
        name: 'Lever',
        seconds: 0.36,
        build(v) {
          const slide = v.j(0.06, 0.15);
          v.noise(0, { type: 'bandpass', freq: 1200, q: 1, tau: 1, gain: 0.07, attack: 0.02, dur: slide });
          v.hit(slide, metal(700, 0.04), tick(3000, 0.003, 0.8));
          v.hit(slide + v.j(0.012, 0.2), metal(900, 0.02), tick(3500), 0.3);
        },
      },
      {
        id: 'key-switch',
        name: 'Key switch',
        seconds: 0.14,
        build(v) {
          v.hit(0, metal(3100, 0.006), tick(5000, 0.0015, 0.6), 0.7);
          v.hit(v.j(0.045, 0.15), metal(2700, 0.01), tick(4500, 0.002, 0.8));
        },
      },
      {
        id: 'relay',
        name: 'Relay',
        seconds: 0.09,
        build(v) {
          v.hit(0, metal(3200, 0.006), tick(6000, 0.0015, 1));
          v.hit(v.j(0.003, 0.2), metal(3500, 0.004), tick(6500), 0.4);
          v.hit(v.j(0.007, 0.2), metal(3400, 0.003), tick(6500), 0.2);
        },
      },
      {
        id: 'latch',
        name: 'Latch',
        seconds: 0.12,
        build(v) {
          v.hit(0, plastic(1500, 0.012), tick(3500, 0.002, 0.7));
          v.hit(v.j(0.008, 0.25), metal(2600, 0.006), tick(5000), 0.45);
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Output

export interface GeneratedFile {
  path: string;
  samples: Float32Array;
}

/** Render every variation of every recipe. Pure: no file system access. */
export function generateLibrary(variations = VARIATIONS): {
  manifest: SampleManifest;
  files: GeneratedFile[];
} {
  const files: GeneratedFile[] = [];
  const categories: SampleCategory[] = LIBRARY.map((cat) => ({
    id: cat.id,
    name: cat.name,
    sounds: cat.recipes.map((recipe) => {
      const paths: string[] = [];
      for (let i = 1; i <= variations; i++) {
        const path = `${cat.id}/${recipe.id}-${i}.wav`;
        const v = new Voice(recipe.seconds, hash(path));
        recipe.build(v);
        // ±1 dB level jitter between round robins, like real repeated takes.
        files.push({ path, samples: finish(v.data, PEAK * Math.pow(10, v.r(-1, 1) / 20)) });
        paths.push(path);
      }
      return {
        id: recipe.id,
        name: recipe.name,
        placeholder: true,
        source: 'Synthesised by scripts/samples/generate.ts',
        license: 'CC0-1.0',
        files: paths,
      };
    }),
  }));
  return {
    manifest: {
      format: 'openclick-samples',
      version: 1,
      name: 'OpenClick placeholder library (synthesised)',
      placeholder: true,
      license: 'CC0-1.0',
      categories,
    },
    files,
  };
}

export function writeLibrary(outDir: string, manifestPath: string): { files: number; bytes: number } {
  const { manifest, files } = generateLibrary();
  for (const cat of manifest.categories) rmSync(join(outDir, cat.id), { recursive: true, force: true });
  let bytes = 0;
  for (const f of files) {
    const wav = encodeWav16(f.samples);
    mkdirSync(dirname(join(outDir, f.path)), { recursive: true });
    writeFileSync(join(outDir, f.path), wav);
    bytes += wav.length;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { files: files.length, bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const outDir = join(root, 'public/samples');
  const manifestPath = join(root, 'src/engines/click/manifest.json');
  const { files, bytes } = writeLibrary(outDir, manifestPath);
  // Keep the committed manifest in the repo's Prettier style so `npm run lint` passes.
  const prettier = await import('prettier');
  const options = await prettier.resolveConfig(manifestPath);
  const json = readFileSync(manifestPath, 'utf8');
  writeFileSync(manifestPath, await prettier.format(json, { ...options, filepath: manifestPath }));
  console.log(`Wrote ${files} samples (${(bytes / 1024 / 1024).toFixed(2)} MB) to ${outDir}`);
  console.log(`Wrote ${manifestPath}`);
}
