import { createRng, num, type EffectModule, type ParamSchema, type Params } from '../core';
import { createMixFrame, glide, mixParam, setParam } from './shared';

const schema = {
  size: {
    kind: 'number',
    label: 'Size',
    group: 'Room',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
    unit: '%',
    randomRange: [0.1, 0.9],
    hint: 'Spacing of the early reflections and how slowly the tail builds up.',
  },
  decay: {
    kind: 'number',
    label: 'Decay',
    group: 'Room',
    min: 0.1,
    max: 10,
    default: 1.4,
    curve: 'log',
    unit: 's',
    randomRange: [0.3, 3],
    hint: 'Time for the tail to fall by 60 dB.',
  },
  preDelay: {
    kind: 'number',
    label: 'Pre-delay',
    group: 'Room',
    min: 0,
    max: 250,
    default: 10,
    unit: 'ms',
    randomRange: [0, 60],
  },
  damping: {
    kind: 'number',
    label: 'Damping',
    group: 'Tone',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
    unit: '%',
    randomRange: [0.2, 0.8],
    hint: 'How much faster high frequencies die away than lows.',
  },
  lowCut: {
    kind: 'number',
    label: 'Low cut',
    group: 'Tone',
    min: 20,
    max: 1000,
    default: 150,
    curve: 'log',
    unit: 'Hz',
    randomRange: [60, 400],
  },
  mix: mixParam(0.25, [0.1, 0.45]),
} satisfies ParamSchema;

export interface ReverbIrSettings {
  sampleRate: number;
  size: number;
  decay: number;
  damping: number;
  seed: number;
}

/** Energy of each IR channel. Keeps the wet level close to the dry one across settings. */
const IR_ENERGY = 0.35;
const EARLY_MS = [7, 11, 17, 23, 31, 41, 53, 67];

/**
 * Synthesise a stereo impulse response: sparse early reflections followed by exponentially
 * decaying noise whose low-pass cutoff falls over time (damping). Deterministic for a seed.
 */
export function generateReverbIr(
  s: ReverbIrSettings,
): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const rng = createRng(s.seed);
  const sr = s.sampleRate;
  const earlyScale = 0.4 + 1.6 * s.size;
  const length = Math.max(1, Math.ceil((s.decay + (EARLY_MS.at(-1)! * earlyScale) / 1000) * sr));
  // -60 dB at `decay` seconds.
  const step = Math.exp(Math.log(1e-3) / (s.decay * sr));
  const fadeIn = Math.max(1, Math.round((0.004 + 0.05 * s.size) * sr));
  const startCut = 18000;
  // Full damping pulls the cutoff down to 500 Hz by the end of the tail.
  const endCut = startCut * Math.pow(500 / startCut, s.damping);
  return [0, 1].map((ch) => {
    const out = new Float32Array(length);
    let env = 1;
    // Two one-pole low-passes in series (12 dB/oct) for an audible damping slope.
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const cutoff = startCut * Math.pow(endCut / startCut, t);
      const a = Math.exp((-2 * Math.PI * Math.min(cutoff, sr * 0.45)) / sr);
      lp = (1 - a) * (rng.next() * 2 - 1) + a * lp;
      const ramp = i < fadeIn ? i / fadeIn : 1;
      lp2 = (1 - a) * lp + a * lp2;
      out[i] = lp2 * env * ramp;
      env *= step;
    }
    EARLY_MS.forEach((ms, k) => {
      // Slightly different spacing per side widens the image.
      const i = Math.round(((ms * earlyScale * (ch ? 1.07 : 0.95)) / 1000) * sr);
      if (i < length) out[i] = out[i]! + (k % 2 ? -1 : 1) * 0.5 * Math.pow(0.82, k);
    });
    let energy = 0;
    for (const v of out) energy += v * v;
    const scale = energy > 0 ? Math.sqrt(IR_ENERGY / energy) : 0;
    for (let i = 0; i < length; i++) out[i] = out[i]! * scale;
    return out;
  }) as [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];
}

const irKey = (p: Params) => `${num(p, 'size')}|${num(p, 'decay')}|${num(p, 'damping')}`;

/** Convolution reverb with a generated impulse response. */
export const reverb: EffectModule = {
  type: 'reverb',
  label: 'Reverb',
  schema,
  tail: (p) => num(p, 'preDelay') / 1000 + num(p, 'decay') + 0.15,
  create(ctx, params, rng) {
    const seed = rng.int(0, 2 ** 31);
    const frame = createMixFrame(ctx, num(params, 'mix'), 'equal-power');
    const pre = ctx.createDelay(0.5);
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.Q.value = Math.SQRT1_2;
    const bus = ctx.createGain();
    frame.input.connect(pre).connect(lowCut);
    bus.connect(frame.wet);

    // Changing the room means a new IR. ConvolverNode buffers can only be set once, so each new
    // IR gets its own convolver and we crossfade, letting the old tail ring out under the new.
    let current: { conv: ConvolverNode; gain: GainNode } | null = null;
    let fading: { conv: ConvolverNode; gain: GainNode } | null = null;
    let key = '';
    const loadIr = (p: Params, immediate: boolean) => {
      key = irKey(p);
      const [l, r] = generateReverbIr({
        sampleRate: ctx.sampleRate,
        size: num(p, 'size'),
        decay: num(p, 'decay'),
        damping: num(p, 'damping'),
        seed,
      });
      const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
      buf.copyToChannel(l, 0);
      buf.copyToChannel(r, 1);
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = buf;
      const gain = ctx.createGain();
      setParam(ctx, gain.gain, immediate ? 1 : 0, true);
      lowCut.connect(conv).connect(gain).connect(bus);
      if (fading) {
        fading.conv.disconnect();
        fading.gain.disconnect();
      }
      fading = current;
      current = { conv, gain };
      if (!immediate) {
        glide(ctx, gain.gain, 1, 0.03);
        if (fading) glide(ctx, fading.gain.gain, 0, 0.08);
      }
    };

    const apply = (p: Params, immediate: boolean) => {
      if (immediate) {
        setParam(ctx, pre.delayTime, num(p, 'preDelay') / 1000, true);
        setParam(ctx, lowCut.frequency, num(p, 'lowCut'), true);
      } else {
        glide(ctx, pre.delayTime, num(p, 'preDelay') / 1000, 0.05);
        glide(ctx, lowCut.frequency, num(p, 'lowCut'));
      }
      if (irKey(p) !== key) loadIr(p, immediate);
      frame.setMix(num(p, 'mix'), immediate);
    };
    apply(params, true);

    return {
      input: frame.input,
      output: frame.output,
      update: (p) => apply(p, false),
      dispose() {
        for (const c of [current, fading]) {
          c?.conv.disconnect();
          c?.gain.disconnect();
        }
        for (const n of [pre, lowCut, bus]) n.disconnect();
        frame.dispose();
      },
    };
  },
};
