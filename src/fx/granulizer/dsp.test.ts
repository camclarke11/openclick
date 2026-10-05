import { describe, expect, it } from 'vitest';
import { createGrainEngine, DEFAULT_GRAIN_SETTINGS, type GrainSettings } from './dsp';

const SR = 48000;
const BLOCK = 128;

function run(settings: Partial<GrainSettings>, input: Float32Array, seed = 1) {
  const g = createGrainEngine(SR, seed);
  g.set({ ...DEFAULT_GRAIN_SETTINGS, ...settings });
  const L = new Float32Array(input.length);
  const R = new Float32Array(input.length);
  for (let b = 0; b < input.length; b += BLOCK) {
    g.process(input.subarray(b, b + BLOCK), L.subarray(b, b + BLOCK), R.subarray(b, b + BLOCK));
  }
  return { L, R };
}

const sine = (seconds: number, freq: number) =>
  Float32Array.from(
    { length: Math.round(seconds * SR) },
    (_, i) => 0.8 * Math.sin((2 * Math.PI * freq * i) / SR),
  );

/** Rising zero crossings per second over a range, a cheap pitch estimate. */
function pitchOf(x: Float32Array, from: number, to: number): number {
  let n = 0;
  for (let i = from + 1; i < to; i++) if (x[i - 1]! < 0 && x[i]! >= 0) n++;
  return n / ((to - from) / SR);
}

describe('createGrainEngine', () => {
  it('produces finite, non-silent output from a tone', () => {
    const { L, R } = run({}, sine(0.5, 440));
    expect(L.every(Number.isFinite) && R.every(Number.isFinite)).toBe(true);
    const peak = Math.max(...L.map(Math.abs), ...R.map(Math.abs));
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThan(2);
  });

  it('transposes grains by the pitch setting', () => {
    const input = sine(1, 300);
    const mid = [Math.round(0.3 * SR), Math.round(0.9 * SR)] as const;
    // Dense, overlapping, unjittered grains centred in the stereo field.
    const base = { density: 60, size: 60, spread: 0, positionJitter: 0, position: 10 };
    const unison = pitchOf(run(base, input).L, ...mid);
    const octave = pitchOf(run({ ...base, pitch: 12 }, input).L, ...mid);
    expect(unison).toBeGreaterThan(270);
    expect(unison).toBeLessThan(330);
    expect(octave / unison).toBeGreaterThan(1.8);
    expect(octave / unison).toBeLessThan(2.2);
  });

  it('is silent for silent input and deterministic for a seed', () => {
    const silent = run({}, new Float32Array(SR / 4));
    expect(silent.L.every((v) => v === 0)).toBe(true);
    const input = sine(0.3, 500);
    const settings = { pitchJitter: 5, reverse: 0.5, spread: 1 };
    expect(Array.from(run(settings, input, 9).L)).toEqual(Array.from(run(settings, input, 9).L));
    expect(Array.from(run(settings, input, 9).L)).not.toEqual(Array.from(run(settings, input, 10).L));
  });

  it('keeps ringing after the input stops and then dies away', () => {
    const input = new Float32Array(SR);
    input.set(sine(0.1, 440));
    const { L } = run({ position: 200, positionJitter: 0 }, input);
    const energy = (a: number, b: number) => L.subarray(a * SR, b * SR).reduce((s, v) => s + v * v, 0);
    expect(energy(0.15, 0.35)).toBeGreaterThan(1);
    expect(energy(0.6, 1)).toBe(0);
  });

  it('honours the full position range with maximally transposed grains', () => {
    const input = new Float32Array(3 * SR);
    input.set(sine(0.05, 440));
    const { L } = run(
      { size: 500, density: 40, pitch: 24, pitchJitter: 12, position: 1000, positionJitter: 0 },
      input,
    );
    const energy = (a: number, b: number) => L.subarray(a * SR, b * SR).reduce((s, v) => s + v * v, 0);
    // Grains read at least 1 s back, so nothing of the burst can be heard before then.
    expect(energy(0, 0.95)).toBe(0);
    expect(energy(0.95, 3)).toBeGreaterThan(0);
  });

  it('survives extreme settings without reading out of range', () => {
    const { L } = run(
      {
        size: 500,
        density: 200,
        pitch: 24,
        pitchJitter: 12,
        position: 1000,
        positionJitter: 1000,
        reverse: 1,
      },
      sine(1, 200),
    );
    expect(L.every(Number.isFinite)).toBe(true);
  });
});
