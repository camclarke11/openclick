import { bool, num, type EffectModule, type ParamSchema, type Params } from '../core';
import { createMixFrame, glide, mixParam } from './shared';

const MAX_DELAY = 2;
/** Tails are cut once the echoes fall this far below the input (dB). */
const TAIL_DB = -60;

const schema = {
  time: {
    kind: 'number',
    label: 'Time',
    group: 'Delay',
    min: 5,
    max: 2000,
    default: 180,
    curve: 'log',
    unit: 'ms',
    randomRange: [30, 450],
  },
  feedback: {
    kind: 'number',
    label: 'Feedback',
    group: 'Delay',
    min: 0,
    max: 0.95,
    default: 0.35,
    step: 0.01,
    unit: '%',
    randomRange: [0, 0.6],
  },
  pingPong: {
    kind: 'bool',
    label: 'Ping-pong',
    group: 'Delay',
    default: false,
    hint: 'Bounce echoes between left and right.',
  },
  tone: {
    kind: 'number',
    label: 'Tone',
    group: 'Filter',
    min: 500,
    max: 20000,
    default: 6000,
    curve: 'log',
    unit: 'Hz',
    randomRange: [1500, 12000],
    hint: 'Low-pass in the feedback loop: each repeat gets darker.',
  },
  lowCut: {
    kind: 'number',
    label: 'Low cut',
    group: 'Filter',
    min: 20,
    max: 2000,
    default: 120,
    curve: 'log',
    unit: 'Hz',
    randomRange: [40, 600],
    hint: 'High-pass in the feedback loop: each repeat gets thinner.',
  },
  mix: mixParam(0.3, [0.15, 0.5]),
} satisfies ParamSchema;

/** Stereo feedback delay with filtered repeats and optional ping-pong. */
export const delay: EffectModule = {
  type: 'delay',
  label: 'Delay',
  schema,
  tail(p) {
    const time = num(p, 'time') / 1000;
    const fb = num(p, 'feedback');
    // Ping-pong repeats alternate sides but decay at the same rate per repeat.
    const repeats = fb <= 0.001 ? 1 : 1 + Math.ceil(TAIL_DB / 20 / Math.log10(fb));
    return Math.min(30, time * repeats + 0.05);
  },
  create(ctx, params) {
    const frame = createMixFrame(ctx, num(params, 'mix'), 'equal-power');
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    frame.input.connect(split);

    // One line per side: in -> delay -> high-pass -> low-pass -> out, with routable feedback.
    const side = () => {
      const d = ctx.createDelay(MAX_DELAY);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.Q.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.5;
      const sum = ctx.createGain();
      sum.connect(d).connect(hp).connect(lp);
      return { sum, d, hp, lp };
    };
    const L = side();
    const R = side();
    const g = () => ctx.createGain();
    // Input routing: stereo feeds each side its own channel; ping-pong feeds the mono sum left.
    const inL = g();
    const inR = g();
    const inRtoL = g();
    split.connect(inL, 0).connect(L.sum);
    split.connect(inR, 1).connect(R.sum);
    split.connect(inRtoL, 1).connect(L.sum);
    // Feedback: self (stereo) or crossed (ping-pong).
    const selfL = g();
    const selfR = g();
    const crossLR = g();
    const crossRL = g();
    L.lp.connect(selfL).connect(L.sum);
    R.lp.connect(selfR).connect(R.sum);
    L.lp.connect(crossLR).connect(R.sum);
    R.lp.connect(crossRL).connect(L.sum);
    L.lp.connect(merge, 0, 0);
    R.lp.connect(merge, 0, 1);
    merge.connect(frame.wet);

    const apply = (p: Params, immediate: boolean) => {
      const set = (param: AudioParam, v: number) => (immediate ? (param.value = v) : glide(ctx, param, v));
      const pp = bool(p, 'pingPong');
      const fb = num(p, 'feedback');
      const time = num(p, 'time') / 1000;
      for (const s of [L, R]) {
        // Delay time glides a little slower, like tape, instead of jumping.
        if (immediate) s.d.delayTime.value = time;
        else glide(ctx, s.d.delayTime, time, 0.05);
        set(s.hp.frequency, num(p, 'lowCut'));
        set(s.lp.frequency, Math.min(num(p, 'tone'), ctx.sampleRate / 2 - 100));
      }
      set(inL.gain, pp ? 0.5 : 1);
      set(inRtoL.gain, pp ? 0.5 : 0);
      set(inR.gain, pp ? 0 : 1);
      set(selfL.gain, pp ? 0 : fb);
      set(selfR.gain, pp ? 0 : fb);
      set(crossLR.gain, pp ? fb : 0);
      set(crossRL.gain, pp ? fb : 0);
      frame.setMix(num(p, 'mix'), immediate);
    };
    apply(params, true);

    const nodes: AudioNode[] = [split, merge, inL, inR, inRtoL, selfL, selfR, crossLR, crossRL];
    for (const s of [L, R]) nodes.push(s.sum, s.d, s.hp, s.lp);
    return {
      input: frame.input,
      output: frame.output,
      update: (p) => apply(p, false),
      dispose() {
        for (const n of nodes) n.disconnect();
        frame.dispose();
      },
    };
  },
};
