import { num, type EffectModule, type ParamSchema, type Params } from '../../core';
import { createMixFrame, createWorkletSlot, mixParam, prepareProcessor } from '../shared';
import type { CrusherSettings } from './dsp';
import processorUrl from './processor.ts?worker&url';

const NAME = 'openclick-bitcrusher';

const schema = {
  bits: {
    kind: 'number',
    label: 'Bits',
    group: 'Crush',
    min: 1,
    max: 16,
    default: 8,
    step: 0.1,
    randomRange: [3, 12],
  },
  rate: {
    kind: 'number',
    label: 'Rate',
    group: 'Crush',
    min: 500,
    max: 48000,
    default: 11025,
    curve: 'log',
    unit: 'Hz',
    randomRange: [2000, 22050],
    hint: 'Sample-and-hold rate. Lower values add aliasing and a lo-fi, 8-bit character.',
  },
  mix: mixParam(1, [0.4, 1]),
} satisfies ParamSchema;

const settings = (p: Params): CrusherSettings => ({ bits: num(p, 'bits'), rate: num(p, 'rate') });

/** Bit depth and sample-rate reduction (AudioWorklet). */
export const bitcrusher: EffectModule = {
  type: 'bitcrusher',
  label: 'Bitcrusher',
  schema,
  tail: () => 0.01,
  prepare: (ctx) => prepareProcessor(ctx, processorUrl, NAME),
  create(ctx, params) {
    const frame = createMixFrame(ctx, num(params, 'mix'), 'linear');
    const slot = createWorkletSlot(ctx, frame.input, frame.wet, {
      url: processorUrl,
      name: NAME,
      settings: settings(params),
    });
    return {
      input: frame.input,
      output: frame.output,
      update(p) {
        slot.post(settings(p));
        frame.setMix(num(p, 'mix'));
      },
      dispose() {
        slot.dispose();
        frame.dispose();
      },
    };
  },
};
