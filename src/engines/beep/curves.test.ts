import { describe, expect, it } from 'vitest';
import { sanitizeParams, type Params } from '../../core';
import { buildCurves, CONTROL_RATE, snapToScale } from './curves';
import { beepSchema } from './schema';
import { waveCoefficients } from './wave';
import { chipNoise, pinkNoise, whiteNoise } from './noise';
import { softClipCurve } from './speaker';

const params = (p: Partial<Params> = {}) => sanitizeParams(beepSchema, p);
const note = { note: 60, velocity: 1, gate: 0.25 };

describe('waveCoefficients', () => {
  it('hits the classic shapes at integer positions', () => {
    const sine = waveCoefficients(0, 0.5);
    expect(sine.imag[1]).toBeCloseTo(1);
    expect(sine.imag[2]).toBeCloseTo(0);
    const tri = waveCoefficients(1, 0.5);
    expect(tri.imag[2]).toBeCloseTo(0);
    expect(tri.imag[3]! / tri.imag[1]!).toBeCloseTo(-1 / 9);
    const saw = waveCoefficients(2, 0.5);
    expect(saw.imag[2]! / saw.imag[1]!).toBeCloseTo(1 / 2);
    const square = waveCoefficients(3, 0.5);
    expect(square.imag[2]).toBeCloseTo(0);
    expect(square.imag[3]! / square.imag[1]!).toBeCloseTo(1 / 3);
    expect(square.real[1]).toBeCloseTo(0);
  });

  it('pulse width changes the harmonic balance at shape 4', () => {
    const narrow = waveCoefficients(4, 0.1);
    // A 10% pulse has a strong 2nd harmonic, unlike a square.
    expect(Math.hypot(narrow.real[2]!, narrow.imag[2]!)).toBeGreaterThan(0.1);
  });

  it('morphs continuously', () => {
    const a = waveCoefficients(1.99, 0.5);
    const b = waveCoefficients(2, 0.5);
    expect(a.imag[2]).toBeCloseTo(b.imag[2]!, 1);
  });
});

describe('buildCurves', () => {
  it('ends silent and trims to the audible part', () => {
    const c = buildCurves(params(), note);
    expect(c.amp[c.amp.length - 1]).toBe(0);
    expect(c.duration).toBeLessThan(0.3);
    expect(Math.max(...c.amp)).toBeCloseTo(1, 2);
  });

  it('holds sustain for the gate then releases', () => {
    const c = buildCurves(params({ sustain: 0.5, release: 0.1 }), { ...note, gate: 0.5 });
    expect(c.amp[Math.round(0.4 * CONTROL_RATE)]).toBeCloseTo(0.5, 2);
    expect(c.duration).toBeGreaterThan(0.5);
    expect(c.duration).toBeLessThanOrEqual(0.61);
  });

  it('sweep starts at the offset and lands on the note', () => {
    const c = buildCurves(params({ sweep: 12, sweepTime: 0.1, sustain: 1 }), note);
    expect(c.cents[0]).toBeCloseTo(1200);
    expect(c.cents[Math.round(0.05 * CONTROL_RATE)]).toBeCloseTo(600, -1);
    expect(c.cents[Math.round(0.15 * CONTROL_RATE)]).toBeCloseTo(0);
  });

  it('sequencer produces one step per segment and loops when asked', () => {
    const steps = [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const once = buildCurves(
      params({ seqOn: true, seqSteps: steps, seqLength: 2, seqRate: 0.05, sustain: 1 }),
      note,
    );
    expect(once.stepTimes).toEqual([0, 0.05]);
    const loop = buildCurves(
      params({ seqOn: true, seqSteps: steps, seqLength: 2, seqRate: 0.05, seqLoop: true, sustain: 1 }),
      note,
    );
    expect(loop.stepTimes.length).toBe(5);
    expect(loop.cents[Math.round(0.125 * CONTROL_RATE)]).toBeCloseTo(0);
    expect(loop.cents[Math.round(0.175 * CONTROL_RATE)]).toBeCloseTo(500);
  });

  it('snaps steps to the chosen scale', () => {
    expect(snapToScale(6, 'major')).toBe(5);
    expect(snapToScale(-1, 'pentatonic')).toBe(0);
    expect(snapToScale(13, 'octaves')).toBe(12);
    expect(snapToScale(6.4, 'chromatic')).toBe(6);
  });

  it('FM depth decays and tracks pitch', () => {
    const c = buildCurves(
      params({ fmIndex: 2, fmRatio: 1, fmDecay: 0.1, sweep: 12, sweepTime: 0.5, sustain: 1 }),
      note,
    );
    // At t=0 the note is an octave up, so the deviation is doubled.
    expect(c.fmDepth[0]).toBeCloseTo(2 * 261.63 * 2, 0);
    expect(c.fmDepth[Math.round(0.1 * CONTROL_RATE)]!).toBeLessThan(c.fmDepth[0]! / 500);
  });
});

describe('noise and speaker helpers', () => {
  it('generates bounded, deterministic noise', () => {
    expect(whiteNoise(1000)).toEqual(whiteNoise(1000));
    for (const buf of [whiteNoise(4800), pinkNoise(4800), chipNoise(6, false), chipNoise(6, true)]) {
      expect(buf.every((v) => Math.abs(v) <= 1)).toBe(true);
      expect(buf.some((v) => v !== buf[0])).toBe(true);
    }
  });

  it('short chip noise is periodic so it loops cleanly', () => {
    const buf = chipNoise(1, true);
    // The short LFSR repeats every 93 (or 31) steps; the buffer holds a whole number of them.
    let periodic = true;
    for (let i = 0; i < buf.length - 93; i++) if (buf[i] !== buf[i + 93]) periodic = false;
    expect(periodic).toBe(true);
    expect(buf.length % 93).toBe(0);
  });

  it('soft clip maps ±1 to ±1 and is monotonic', () => {
    const c = softClipCurve(3);
    expect(c[0]).toBeCloseTo(-1);
    expect(c[c.length - 1]).toBeCloseTo(1);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
  });
});
