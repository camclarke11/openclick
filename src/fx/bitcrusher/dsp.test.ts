import { describe, expect, it } from 'vitest';
import { createCrusher } from './dsp';

const SR = 48000;
const sine = (n: number, freq = 440, amp = 0.9) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / SR));

describe('createCrusher', () => {
  it('quantises to the bit depth', () => {
    const c = createCrusher(SR);
    c.set({ bits: 3, rate: SR });
    const out = new Float32Array(4800);
    c.process(sine(4800), out, 0);
    // 3 bits: steps of 1/4 between -1 and 1.
    const levels = new Set(Array.from(out));
    expect(levels.size).toBeLessThanOrEqual(9);
    for (const v of levels) expect(Math.abs(v * 4 - Math.round(v * 4))).toBeLessThan(1e-6);
  });

  it('is transparent at 16 bits and full rate', () => {
    const c = createCrusher(SR);
    c.set({ bits: 16, rate: SR });
    const input = sine(480);
    const out = new Float32Array(480);
    c.process(input, out, 0);
    for (let i = 0; i < input.length; i++) expect(Math.abs(out[i]! - input[i]!)).toBeLessThan(1 / 32768);
  });

  it('holds samples to reduce the sample rate, across block boundaries', () => {
    const c = createCrusher(SR);
    c.set({ bits: 16, rate: SR / 8 });
    const input = sine(1024, 100);
    const out = new Float32Array(1024);
    for (let b = 0; b < 1024; b += 128) c.process(input.subarray(b, b + 128), out.subarray(b, b + 128), 0);
    let changes = 0;
    for (let i = 1; i < out.length; i++) if (out[i] !== out[i - 1]) changes++;
    expect(changes).toBeGreaterThan(1024 / 8 - 4);
    expect(changes).toBeLessThanOrEqual(1024 / 8);
  });

  it('never exceeds full scale', () => {
    const c = createCrusher(SR);
    c.set({ bits: 1, rate: 1000 });
    const out = new Float32Array(2048);
    c.process(sine(2048, 440, 1.5), out, 0);
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});
