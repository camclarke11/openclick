import { num, type ParamSchema, type SourceModule } from '../../core';

/**
 * Click sample engine. FOUNDATION STUB: a synthesized filtered-noise tick so layering can be
 * exercised before the sample library exists. The Click workstream replaces this module with
 * real sample playback (see docs/PLAN.md).
 */
const schema = {
  tone: {
    kind: 'number',
    label: 'Tone',
    group: 'Sample',
    min: 200,
    max: 12000,
    default: 3000,
    curve: 'log',
    unit: 'Hz',
  },
  length: {
    kind: 'number',
    label: 'Length',
    group: 'Sample',
    min: 0.002,
    max: 0.2,
    default: 0.02,
    curve: 'log',
    unit: 's',
  },
} satisfies ParamSchema;

export const clickSource: SourceModule = {
  type: 'click',
  label: 'Click',
  schema,
  createVoice({ ctx, output, rng }, p, ev) {
    const t = ev.time;
    const len = num(p, 'length');
    const frames = Math.max(1, Math.ceil(len * ctx.sampleRate));
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (rng.next() * 2 - 1) * Math.pow(1 - i / frames, 3);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (ev.note - 60) / 12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = num(p, 'tone');
    filter.Q.value = 1.5;
    const amp = ctx.createGain();
    amp.gain.value = ev.velocity;
    src.connect(filter).connect(amp).connect(output);
    src.start(t);
    const endTime = t + len / src.playbackRate.value + 0.01;
    return { endTime, stop: (now) => src.stop(now) };
  },
};
