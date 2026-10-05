import { num, type EffectModule, type ParamSchema, type Params } from '../../core';
import { createMixFrame, createWorkletSlot, mixParam, prepareProcessor } from '../shared';
import type { GrainSettings } from './dsp';
import processorUrl from './processor.ts?worker&url';

const NAME = 'openclick-granulizer';

const schema = {
  size: {
    kind: 'number',
    label: 'Grain size',
    group: 'Grains',
    min: 5,
    max: 500,
    default: 80,
    curve: 'log',
    unit: 'ms',
    randomRange: [20, 200],
  },
  density: {
    kind: 'number',
    label: 'Density',
    group: 'Grains',
    min: 1,
    max: 200,
    default: 20,
    curve: 'log',
    unit: 'x',
    randomRange: [5, 60],
    hint: 'Grains per second.',
  },
  position: {
    kind: 'number',
    label: 'Position',
    group: 'Grains',
    min: 0,
    max: 1000,
    default: 30,
    unit: 'ms',
    randomRange: [0, 200],
    hint: 'How far back in the input grains start reading.',
  },
  positionJitter: {
    kind: 'number',
    label: 'Position jitter',
    group: 'Grains',
    min: 0,
    max: 1000,
    default: 40,
    unit: 'ms',
    randomRange: [0, 150],
  },
  pitch: {
    kind: 'number',
    label: 'Pitch',
    group: 'Pitch',
    min: -24,
    max: 24,
    default: 0,
    step: 1,
    unit: 'st',
    randomRange: [-12, 12],
  },
  pitchJitter: {
    kind: 'number',
    label: 'Pitch jitter',
    group: 'Pitch',
    min: 0,
    max: 12,
    default: 0,
    step: 0.1,
    unit: 'st',
    randomRange: [0, 4],
  },
  reverse: {
    kind: 'number',
    label: 'Reverse',
    group: 'Pitch',
    min: 0,
    max: 1,
    default: 0,
    step: 0.01,
    unit: '%',
    randomRange: [0, 0.5],
    hint: 'Chance that a grain plays backwards.',
  },
  spread: {
    kind: 'number',
    label: 'Spread',
    group: 'Output',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
    unit: '%',
  },
  mix: mixParam(0.5, [0.3, 0.8]),
} satisfies ParamSchema;

export const grainSettings = (p: Params): GrainSettings => ({
  size: num(p, 'size'),
  density: num(p, 'density'),
  pitch: num(p, 'pitch'),
  pitchJitter: num(p, 'pitchJitter'),
  position: num(p, 'position'),
  positionJitter: num(p, 'positionJitter'),
  reverse: num(p, 'reverse'),
  spread: num(p, 'spread'),
});

/** Granular resynthesis of the incoming sound (AudioWorklet). */
export const granulizer: EffectModule = {
  type: 'granulizer',
  label: 'Granulizer',
  schema,
  tail(p) {
    // The last grain can start reading position + jitter back, and runs for its own length.
    const span =
      (num(p, 'size') * Math.pow(2, Math.max(0, num(p, 'pitch') + num(p, 'pitchJitter')) / 12)) / 1000;
    return (num(p, 'position') + num(p, 'positionJitter')) / 1000 + span + num(p, 'size') / 1000 + 0.05;
  },
  prepare: (ctx) => prepareProcessor(ctx, processorUrl, NAME),
  create(ctx, params, rng) {
    const frame = createMixFrame(ctx, num(params, 'mix'), 'equal-power');
    const slot = createWorkletSlot(ctx, frame.input, frame.wet, {
      url: processorUrl,
      name: NAME,
      settings: grainSettings(params),
      processorOptions: { seed: rng.int(0, 2 ** 31) },
    });
    return {
      input: frame.input,
      output: frame.output,
      update(p) {
        slot.post(grainSettings(p));
        frame.setMix(num(p, 'mix'));
      },
      dispose() {
        slot.dispose();
        frame.dispose();
      },
    };
  },
};
