/** Granular DSP. Plain code shared by the AudioWorklet processor and the unit tests. */
// Only the RNG module: the worklet scope cannot evaluate the whole core index in dev (it pulls
// in modules that touch the DOM). The production bundle tree-shakes either way.
// eslint-disable-next-line no-restricted-imports
import { createRng } from '../../core/rng';

export interface GrainSettings {
  /** Grain length (ms). */
  size: number;
  /** Grains started per second. */
  density: number;
  /** Grain transpose (semitones). */
  pitch: number;
  /** Random +/- transpose per grain (semitones). */
  pitchJitter: number;
  /** How far back in the input each grain starts reading (ms). */
  position: number;
  /** Random extra distance back per grain (ms). */
  positionJitter: number;
  /** Probability (0..1) that a grain plays backwards. */
  reverse: number;
  /** Random stereo placement per grain (0 = centre, 1 = full width). */
  spread: number;
}

export const DEFAULT_GRAIN_SETTINGS: GrainSettings = {
  size: 80,
  density: 20,
  pitch: 0,
  pitchJitter: 0,
  position: 30,
  positionJitter: 40,
  reverse: 0,
  spread: 0.5,
};

/**
 * Input history kept for grains to read from. It must cover the furthest a grain can reach
 * back at the schema maxima: position + jitter (2 s), plus the read-ahead a transposed grain
 * needs (500 ms at +36 st reads 4 s, 3.5 s ahead of real time), plus that 4 s span itself.
 */
const HISTORY_SECONDS = 10;
const MAX_GRAINS = 96;

interface Grain {
  /** Read position in absolute input samples (fractional). */
  pos: number;
  /** Read increment per output sample (negative when reversed). */
  inc: number;
  age: number;
  length: number;
  /** Block index the grain starts at (only non-zero in the block it was spawned in). */
  offset: number;
  gainL: number;
  gainR: number;
}

export interface GrainEngine {
  set(s: GrainSettings): void;
  /** Mono in, stereo out. Blocks may be any length. */
  process(input: Float32Array, outL: Float32Array, outR: Float32Array): void;
}

// A factory rather than a class: Vite's dev server adds Preact refresh code to modules that
// declare capitalised classes, and that code cannot run in the AudioWorklet scope.
export function createGrainEngine(sampleRate: number, seed: number): GrainEngine {
  const sr = sampleRate;
  const history = new Float32Array(Math.ceil(HISTORY_SECONDS * sr));
  const hl = history.length;
  const rng = createRng(seed);
  /** Absolute index of the next input sample to be written. */
  let written = 0;
  let untilNext = 0;
  let grains: Grain[] = [];
  let s: GrainSettings = DEFAULT_GRAIN_SETTINGS;

  const spawn = (now: number, offset: number, length: number) => {
    if (grains.length >= MAX_GRAINS) return;
    const st = s.pitch + (rng.next() * 2 - 1) * s.pitchJitter;
    const ratio = Math.pow(2, st / 12);
    const reverse = rng.next() < s.reverse;
    const span = length * ratio;
    const back = ((s.position + rng.next() * s.positionJitter) / 1000) * sr;
    // A forward grain that reads faster than real time must start far enough back not to
    // overtake the write head; a reversed one starts at its newest sample and reads back.
    const ahead = reverse ? 0 : Math.max(0, span - length);
    const maxBack = hl - span - 2;
    const start = now - Math.min(maxBack, Math.max(back + ahead, 1) + 1);
    const pan = (rng.next() * 2 - 1) * s.spread;
    const angle = ((pan + 1) * Math.PI) / 4;
    grains.push({
      pos: start,
      inc: reverse ? -ratio : ratio,
      age: 0,
      length,
      offset,
      gainL: Math.cos(angle) * Math.SQRT2,
      gainR: Math.sin(angle) * Math.SQRT2,
    });
  };

  return {
    set(next) {
      s = next;
    },
    process(input, outL, outR) {
      const n = input.length;
      for (let i = 0; i < n; i++) history[(written + i) % hl] = input[i]!;
      outL.fill(0);
      outR.fill(0);

      const length = Math.max(16, Math.round((s.size / 1000) * sr));
      const overlap = (s.density * length) / sr;
      // Keep level roughly constant as grains overlap more (uncorrelated grains add in power).
      const norm = 1 / Math.sqrt(Math.max(1, overlap * 0.75));

      for (let i = 0; i < n; i++) {
        if (--untilNext <= 0) {
          spawn(written + i, i, length);
          const interval = sr / Math.max(0.1, s.density);
          untilNext = interval * (0.75 + 0.5 * rng.next());
        }
      }

      const keep: Grain[] = [];
      for (const g of grains) {
        for (let i = g.offset; i < n && g.age < g.length; i++, g.age++, g.pos += g.inc) {
          const w = Math.sin((Math.PI * g.age) / g.length);
          const p = Math.floor(g.pos);
          const frac = g.pos - p;
          const a = history[((p % hl) + hl) % hl]!;
          const b = history[(((p + 1) % hl) + hl) % hl]!;
          const v = (a + (b - a) * frac) * w * w * norm;
          outL[i] = outL[i]! + v * g.gainL;
          outR[i] = outR[i]! + v * g.gainR;
        }
        g.offset = 0;
        if (g.age < g.length) keep.push(g);
      }
      grains = keep;
      written += n;
    },
  };
}
