import { num, type EffectModule, type ParamSchema, type Params } from '../core';
import { createMixFrame, mixParam, setParam } from './shared';

const MAX_VOICES = 4;
/** LFO phase (degrees) and rate multiplier per voice; voices 1 and 2 are opposite. */
const VOICE_PHASE = [0, 180, 90, 270];
const VOICE_RATE = [1, 1.07, 0.93, 1.13];

const schema = {
  rate: {
    kind: 'number',
    label: 'Rate',
    group: 'Chorus',
    min: 0.05,
    max: 8,
    default: 0.8,
    curve: 'log',
    unit: 'Hz',
    randomRange: [0.2, 3],
  },
  depth: {
    kind: 'number',
    label: 'Depth',
    group: 'Chorus',
    min: 0,
    max: 10,
    default: 3,
    step: 0.1,
    unit: 'ms',
    randomRange: [1, 6],
    hint: 'How far each voice drifts in time, which sets the amount of detune.',
  },
  delay: {
    kind: 'number',
    label: 'Delay',
    group: 'Chorus',
    min: 5,
    max: 40,
    default: 15,
    unit: 'ms',
    randomRange: [8, 25],
  },
  voices: {
    kind: 'number',
    label: 'Voices',
    group: 'Chorus',
    min: 1,
    max: MAX_VOICES,
    default: 2,
    step: 1,
  },
  spread: {
    kind: 'number',
    label: 'Spread',
    group: 'Chorus',
    min: 0,
    max: 1,
    default: 0.8,
    step: 0.01,
    unit: '%',
    randomRange: [0.3, 1],
    hint: 'Stereo width of the voices.',
  },
  mix: mixParam(0.5, [0.25, 0.7]),
} satisfies ParamSchema;

/** Multi-voice chorus: modulated short delays spread across the stereo field. */
export const chorus: EffectModule = {
  type: 'chorus',
  label: 'Chorus',
  schema,
  tail: (p) => (num(p, 'delay') + num(p, 'depth')) / 1000 + 0.02,
  create(ctx, params) {
    const frame = createMixFrame(ctx, num(params, 'mix'), 'equal-power');
    const voices = Array.from({ length: MAX_VOICES }, (_, i) => {
      const d = ctx.createDelay(0.1);
      const pan = ctx.createStereoPanner();
      const level = ctx.createGain();
      const lfo = ctx.createOscillator();
      const phase = (VOICE_PHASE[i]! * Math.PI) / 180;
      lfo.setPeriodicWave(
        ctx.createPeriodicWave(
          new Float32Array([0, Math.sin(phase)]),
          new Float32Array([0, Math.cos(phase)]),
          {
            disableNormalization: true,
          },
        ),
      );
      const depth = ctx.createGain();
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      frame.input.connect(d).connect(pan).connect(level).connect(frame.wet);
      return { d, pan, level, lfo, depth };
    });

    const apply = (p: Params, immediate: boolean) => {
      const set = (param: AudioParam, v: number) => setParam(ctx, param, v, immediate);
      const n = Math.round(num(p, 'voices'));
      const spread = num(p, 'spread');
      // Mean delay must stay above the swing so delayTime never goes negative.
      const swing = num(p, 'depth') / 2000;
      const base = Math.max(num(p, 'delay') / 1000, swing + 0.001);
      voices.forEach((v, i) => {
        const on = i < n;
        set(v.level.gain, on ? 1 / Math.sqrt(n) : 0);
        set(v.lfo.frequency, num(p, 'rate') * VOICE_RATE[i]!);
        set(v.depth.gain, swing);
        set(v.d.delayTime, base);
        set(v.pan.pan, n === 1 || !on ? 0 : spread * (-1 + (2 * i) / (n - 1)));
      });
      frame.setMix(num(p, 'mix'), immediate);
    };
    apply(params, true);

    return {
      input: frame.input,
      output: frame.output,
      update: (p) => apply(p, false),
      dispose() {
        for (const v of voices) {
          v.lfo.stop();
          for (const node of [v.lfo, v.depth, v.d, v.pan, v.level]) node.disconnect();
        }
        frame.dispose();
      },
    };
  },
};
