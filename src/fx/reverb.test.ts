import { describe, expect, it } from 'vitest';
import { generateReverbIr } from './reverb';

const base = { sampleRate: 48000, size: 0.5, decay: 1, damping: 0.5, seed: 1 };
const energy = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return s;
};

describe('generateReverbIr', () => {
  it('lasts the decay time and decays by about 60 dB', () => {
    const [l] = generateReverbIr(base);
    expect(l.length / 48000).toBeGreaterThan(1);
    expect(l.length / 48000).toBeLessThan(1.2);
    const early = energy(l, 4800, 9600) / 4800;
    const late = energy(l, l.length - 4800) / 4800;
    expect(10 * Math.log10(early / late)).toBeGreaterThan(40);
  });

  it('is decorrelated between channels and deterministic', () => {
    const [l, r] = generateReverbIr(base);
    let dot = 0;
    for (let i = 0; i < l.length; i++) dot += l[i]! * r[i]!;
    expect(Math.abs(dot) / Math.sqrt(energy(l) * energy(r))).toBeLessThan(0.3);
    expect(Array.from(generateReverbIr(base)[0])).toEqual(Array.from(l));
  });

  it('damping darkens the tail', () => {
    // High-frequency content: energy of the first difference relative to the signal.
    const brightness = (x: Float32Array) => {
      let d = 0;
      for (let i = 1; i < x.length; i++) d += (x[i]! - x[i - 1]!) ** 2;
      return d / energy(x);
    };
    const tail = (damping: number) => generateReverbIr({ ...base, damping })[0].subarray(24000);
    expect(brightness(tail(0.9))).toBeLessThan(brightness(tail(0)) * 0.5);
  });

  it('normalises energy across decay times', () => {
    const short = energy(generateReverbIr({ ...base, decay: 0.2 })[0]);
    const long = energy(generateReverbIr({ ...base, decay: 8 })[0]);
    expect(short).toBeCloseTo(long, 3);
  });
});
