import { describe, expect, it } from 'vitest';
import { createRng, defaultPatch, peak, randomizeParams, sanitizeParams, type Params } from '../../core';
import { registry } from '../../modules';
import { renderForTest } from '../../test/audio';
import { beepSchema } from './schema';

const SR = 48000;

async function render(
  params: Partial<Params>,
  opts: { seed?: number; note?: number; velocity?: number } = {},
) {
  const patch = defaultPatch(registry, 'beep');
  patch.layers[0]!.params = sanitizeParams(beepSchema, { ...patch.layers[0]!.params, ...params });
  const audio = await renderForTest(registry, patch, opts);
  return { audio, ch: audio.channels[0]! };
}

/** Sign changes per second in [from, to) seconds: a cheap pitch estimate for clean waves. */
function crossingRate(ch: Float32Array, from: number, to: number): number {
  let n = 0;
  const a = Math.floor(from * SR);
  const b = Math.min(ch.length, Math.floor(to * SR));
  for (let i = a + 1; i < b; i++) if (ch[i - 1]! < 0 !== ch[i]! < 0) n++;
  return n / 2 / (to - from);
}

function rms(ch: Float32Array, from: number, to: number): number {
  let s = 0;
  const a = Math.floor(from * SR);
  const b = Math.floor(to * SR);
  for (let i = a; i < b; i++) s += (ch[i] ?? 0) ** 2;
  return Math.sqrt(s / (b - a));
}

const finite = (ch: Float32Array) => ch.every((v) => Number.isFinite(v));

describe('beep source', () => {
  it.each([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4])(
    'shape %s renders non-silent and under 0 dBFS',
    async (shape) => {
      const { audio, ch } = await render({ shape, pulseWidth: 0.1 });
      expect(peak(audio)).toBeGreaterThan(0.1);
      expect(peak(audio)).toBeLessThanOrEqual(1);
      expect(finite(ch)).toBe(true);
    },
  );

  it('plays at the played pitch', async () => {
    const { ch } = await render({ sustain: 1, decay: 1 }, { note: 69 });
    expect(crossingRate(ch, 0.02, 0.2)).toBeCloseTo(440, -1);
  });

  it('sweeps up from a negative start offset and down from a positive one', async () => {
    const base = { sweepTime: 0.2, sustain: 1, decay: 1 };
    const up = (await render({ ...base, sweep: -24 })).ch;
    const down = (await render({ ...base, sweep: 24 })).ch;
    expect(crossingRate(up, 0.0, 0.05)).toBeLessThan(crossingRate(up, 0.2, 0.25) * 0.6);
    expect(crossingRate(down, 0.0, 0.05)).toBeGreaterThan(crossingRate(down, 0.2, 0.25) * 1.6);
  });

  it('exponential sweeps move faster at the start than linear ones', async () => {
    const base = { sweepTime: 0.3, sustain: 1, decay: 1, sweep: 24 };
    const lin = (await render({ ...base, sweepCurve: 'lin' })).ch;
    const exp = (await render({ ...base, sweepCurve: 'exp' })).ch;
    expect(crossingRate(exp, 0.06, 0.1)).toBeLessThan(crossingRate(lin, 0.06, 0.1));
  });

  it('sequencer steps the pitch in distinct segments within one note', async () => {
    const steps = [0, 12, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { ch } = await render({ seqOn: true, seqSteps: steps, seqLength: 3, seqRate: 0.1, sustain: 1 });
    const f0 = crossingRate(ch, 0.01, 0.09);
    const f1 = crossingRate(ch, 0.11, 0.19);
    const f2 = crossingRate(ch, 0.21, 0.29);
    expect(f1 / f0).toBeCloseTo(2, 1);
    expect(f2 / f0).toBeCloseTo(Math.pow(2, 7 / 12), 1);
    // The one-shot sequence holds the note until its last step has played.
    expect(ch.length / SR).toBeGreaterThan(0.3);
  });

  it('retrigger mode re-attacks the amp envelope on each step', async () => {
    const seq = {
      seqOn: true,
      seqSteps: Array(16).fill(0),
      seqLength: 3,
      seqRate: 0.1,
      decay: 0.05,
      sustain: 0,
    };
    const step = (await render({ ...seq, seqMode: 'step' })).ch;
    const retrig = (await render({ ...seq, seqMode: 'retrigger' })).ch;
    expect(rms(retrig, 0.1, 0.12)).toBeGreaterThan(0.1);
    expect(rms(step, 0.1, 0.12)).toBeLessThan(0.01);
  });

  it('FM, noise types and speaker models render clean audio', async () => {
    const cases: Partial<Params>[] = [
      { fmIndex: 5, fmRatio: 3.5 },
      { noiseLevel: 1, noiseType: 'white' },
      { noiseLevel: 1, noiseType: 'pink', oscLevel: 0 },
      { noiseLevel: 1, noiseType: 'chip', oscLevel: 0, sweep: 12 },
      { noiseLevel: 1, noiseType: 'chip-metal', oscLevel: 0 },
      ...['phone', 'laptop', 'piezo', 'handheld', 'tv'].map((speaker) => ({ speaker, shape: 3 })),
      { filterType: 'highpass', cutoff: 2000, resonance: 4, shape: 2 },
      { filterType: 'bandpass', cutoff: 1000, filterEnv: 3, shape: 2 },
      { vibratoDepth: 100, vibratoRate: 12, sustain: 0.5 },
      { pitchEnv: 12, sustain: 0.5 },
    ];
    for (const c of cases) {
      const { audio, ch } = await render(c);
      expect(finite(ch), JSON.stringify(c)).toBe(true);
      expect(peak(audio), JSON.stringify(c)).toBeGreaterThan(0.02);
      expect(peak(audio), JSON.stringify(c)).toBeLessThanOrEqual(1);
    }
  });

  it('FM changes the timbre', async () => {
    const plain = (await render({ sustain: 1 })).ch;
    const fm = (await render({ sustain: 1, fmIndex: 4, fmDecay: 2 })).ch;
    expect(crossingRate(fm, 0.02, 0.1)).toBeGreaterThan(crossingRate(plain, 0.02, 0.1) * 1.5);
  });

  it('velocity scales level', async () => {
    const loud = await render({}, { velocity: 1 });
    const soft = await render({}, { velocity: 0.25 });
    expect(peak(soft.audio) / peak(loud.audio)).toBeCloseTo(0.25, 1);
  });

  it('is deterministic for a seed, including noise', async () => {
    const p = { noiseLevel: 0.5, fmIndex: 2 };
    const a = (await render(p, { seed: 3 })).ch;
    const b = (await render(p, { seed: 3 })).ch;
    const c = (await render(p, { seed: 4 })).ch;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('one-click randomise gives usable sounds', async () => {
    const rng = createRng(42);
    let audible = 0;
    const runs = 40;
    for (let i = 0; i < runs; i++) {
      const p = randomizeParams(beepSchema, sanitizeParams(beepSchema, {}), rng);
      const { audio, ch } = await render(p, { seed: i });
      expect(finite(ch)).toBe(true);
      expect(peak(audio)).toBeLessThanOrEqual(1);
      if (peak(audio) > 0.05) audible++;
    }
    expect(audible / runs).toBeGreaterThanOrEqual(0.9);
  });
});
