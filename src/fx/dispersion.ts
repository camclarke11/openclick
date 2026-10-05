import { num, type EffectModule, type ParamSchema, type Params } from '../core';
import { createMixFrame, glide, mixParam } from './shared';

const MAX_STAGES = 64;

const schema = {
  stages: {
    kind: 'number',
    label: 'Amount',
    group: 'Dispersion',
    min: 0,
    max: MAX_STAGES,
    default: 24,
    step: 1,
    randomRange: [8, 48],
    hint: 'Number of all-pass stages. More stages stretch transients into longer chirps.',
  },
  frequency: {
    kind: 'number',
    label: 'Frequency',
    group: 'Dispersion',
    min: 60,
    max: 8000,
    default: 900,
    curve: 'log',
    unit: 'Hz',
    randomRange: [200, 4000],
    hint: 'Where the delay is concentrated: frequencies near it arrive last.',
  },
  q: {
    kind: 'number',
    label: 'Sharpness',
    group: 'Dispersion',
    min: 0.3,
    max: 4,
    default: 0.9,
    curve: 'log',
    randomRange: [0.5, 2],
    hint: 'Higher values give a narrower, more pitched "pew".',
  },
  mix: mixParam(1, [0.5, 1]),
} satisfies ParamSchema;

/**
 * Longest group delay through `stages` second-order all-passes (seconds). A biquad all-pass
 * delays w0 by 4Q / w0 and DC by 2 / (Q w0); whichever is larger bounds the smear.
 */
export const dispersionDelay = (stages: number, frequency: number, q: number) =>
  (stages * Math.max(4 * q, 2 / q)) / (2 * Math.PI * frequency);

/**
 * A long chain of all-pass filters. Magnitude is untouched but different frequencies are
 * delayed by different amounts, which smears clicks and hits into laser-like "zap" chirps.
 */
export const dispersion: EffectModule = {
  type: 'dispersion',
  label: 'Dispersion',
  schema,
  tail: (p) => 2 * dispersionDelay(num(p, 'stages'), num(p, 'frequency'), num(p, 'q')) + 0.02,
  create(ctx, params) {
    const frame = createMixFrame(ctx, num(params, 'mix'), 'linear');
    const filters: BiquadFilterNode[] = [];
    // taps[k] picks the output after k stages, so the amount changes without rebuilding.
    const taps: GainNode[] = [];
    const tap0 = ctx.createGain();
    frame.input.connect(tap0).connect(frame.wet);
    taps.push(tap0);
    let prev: AudioNode = frame.input;
    for (let i = 0; i < MAX_STAGES; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'allpass';
      const tap = ctx.createGain();
      prev.connect(f);
      f.connect(tap).connect(frame.wet);
      filters.push(f);
      taps.push(tap);
      prev = f;
    }

    const apply = (p: Params, immediate: boolean) => {
      const set = (param: AudioParam, v: number) => (immediate ? (param.value = v) : glide(ctx, param, v));
      const stages = Math.round(num(p, 'stages'));
      const freq = Math.min(num(p, 'frequency'), ctx.sampleRate / 2 - 100);
      for (const f of filters) {
        set(f.frequency, freq);
        set(f.Q, num(p, 'q'));
      }
      taps.forEach((t, k) => set(t.gain, k === stages ? 1 : 0));
      frame.setMix(num(p, 'mix'), immediate);
    };
    apply(params, true);

    return {
      input: frame.input,
      output: frame.output,
      update: (p) => apply(p, false),
      dispose() {
        for (const n of [...filters, ...taps]) n.disconnect();
        frame.dispose();
      },
    };
  },
};
