import { num, type EffectModule, type NumberParam, type ParamSchema, type Params } from '../core';
import { createMixFrame, glide, mixParam } from './shared';

const freq = (label: string, def: number, group: string, randomRange: [number, number]): NumberParam => ({
  kind: 'number',
  label,
  group,
  min: 20,
  max: 20000,
  default: def,
  curve: 'log',
  unit: 'Hz',
  randomRange,
});

const gain = (label: string, group: string): NumberParam => ({
  kind: 'number',
  label,
  group,
  min: -18,
  max: 18,
  default: 0,
  step: 0.1,
  unit: 'dB',
  randomRange: [-6, 6],
});

const q = (group: string): NumberParam => ({
  kind: 'number',
  label: 'Q',
  group,
  min: 0.2,
  max: 12,
  default: 1,
  curve: 'log',
  randomRange: [0.5, 3],
});

const schema = {
  lowCut: {
    ...freq('Low cut', 20, 'Filters', [20, 400]),
    hint: 'High-pass filter. 20 Hz is off.',
  },
  highCut: {
    ...freq('High cut', 20000, 'Filters', [3000, 20000]),
    hint: 'Low-pass filter. 20 kHz is off.',
  },
  lowFreq: freq('Low shelf', 120, 'Low', [60, 300]),
  lowGain: gain('Low gain', 'Low'),
  mid1Freq: freq('Low-mid', 600, 'Low-mid', [200, 1500]),
  mid1Gain: gain('Low-mid gain', 'Low-mid'),
  mid1Q: q('Low-mid'),
  mid2Freq: freq('High-mid', 3000, 'High-mid', [1500, 7000]),
  mid2Gain: gain('High-mid gain', 'High-mid'),
  mid2Q: q('High-mid'),
  highFreq: freq('High shelf', 8000, 'High', [4000, 14000]),
  highGain: gain('High gain', 'High'),
  output: {
    kind: 'number',
    label: 'Output',
    group: 'Output',
    min: -24,
    max: 12,
    default: 0,
    step: 0.1,
    unit: 'dB',
    randomize: false,
  },
  mix: { ...mixParam(1), randomize: false },
} satisfies ParamSchema;

/** Four-band EQ (low shelf, two peaks, high shelf) with low and high cut filters. */
export const eq: EffectModule = {
  type: 'eq',
  label: 'EQ',
  schema,
  tail: () => 0.05,
  create(ctx, params) {
    const frame = createMixFrame(ctx, num(params, 'mix'), 'linear');
    const make = (type: BiquadFilterType) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      return f;
    };
    const lowCut = make('highpass');
    const highCut = make('lowpass');
    const low = make('lowshelf');
    const mid1 = make('peaking');
    const mid2 = make('peaking');
    const high = make('highshelf');
    const out = ctx.createGain();
    const chain = [lowCut, low, mid1, mid2, high, highCut];
    chain
      .reduce<AudioNode>((prev, n) => prev.connect(n), frame.input)
      .connect(out)
      .connect(frame.wet);

    const apply = (p: Params, immediate: boolean) => {
      const set = (param: AudioParam, v: number) => (immediate ? (param.value = v) : glide(ctx, param, v));
      set(lowCut.frequency, num(p, 'lowCut'));
      lowCut.Q.value = Math.SQRT1_2;
      set(highCut.frequency, Math.min(num(p, 'highCut'), ctx.sampleRate / 2 - 100));
      highCut.Q.value = Math.SQRT1_2;
      set(low.frequency, num(p, 'lowFreq'));
      set(low.gain, num(p, 'lowGain'));
      set(mid1.frequency, num(p, 'mid1Freq'));
      set(mid1.gain, num(p, 'mid1Gain'));
      set(mid1.Q, num(p, 'mid1Q'));
      set(mid2.frequency, num(p, 'mid2Freq'));
      set(mid2.gain, num(p, 'mid2Gain'));
      set(mid2.Q, num(p, 'mid2Q'));
      set(high.frequency, num(p, 'highFreq'));
      set(high.gain, num(p, 'highGain'));
      set(out.gain, Math.pow(10, num(p, 'output') / 20));
      frame.setMix(num(p, 'mix'), immediate);
    };
    apply(params, true);

    return {
      input: frame.input,
      output: frame.output,
      update: (p) => apply(p, false),
      dispose() {
        for (const n of [...chain, out]) n.disconnect();
        frame.dispose();
      },
    };
  },
};
