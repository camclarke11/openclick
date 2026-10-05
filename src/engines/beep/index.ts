import { midiToHz, num, str, type ParamSchema, type SourceModule } from '../../core';

/**
 * Beep synth engine. FOUNDATION STUB: a single oscillator with a pitch sweep and AD envelope,
 * enough to prove the audio path. The Beep workstream replaces this module (see docs/PLAN.md).
 */
const schema = {
  wave: {
    kind: 'enum',
    label: 'Wave',
    group: 'Oscillator',
    options: ['sine', 'triangle', 'square', 'sawtooth'],
    default: 'sine',
  },
  sweep: { kind: 'number', label: 'Sweep', group: 'Pitch', min: -48, max: 48, default: 0, unit: 'st' },
  sweepTime: {
    kind: 'number',
    label: 'Sweep time',
    group: 'Pitch',
    min: 0.001,
    max: 2,
    default: 0.08,
    curve: 'log',
    unit: 's',
  },
  attack: {
    kind: 'number',
    label: 'Attack',
    group: 'Amp',
    min: 0.001,
    max: 1,
    default: 0.002,
    curve: 'log',
    unit: 's',
    randomRange: [0.001, 0.05],
  },
  decay: {
    kind: 'number',
    label: 'Decay',
    group: 'Amp',
    min: 0.005,
    max: 4,
    default: 0.15,
    curve: 'log',
    unit: 's',
    randomRange: [0.02, 0.6],
  },
} satisfies ParamSchema;

export const beepSource: SourceModule = {
  type: 'beep',
  label: 'Beep',
  schema,
  createVoice({ ctx, output }, p, ev) {
    const t = ev.time;
    const attack = num(p, 'attack');
    const decay = num(p, 'decay');
    const end = t + attack + decay;
    const freq = midiToHz(ev.note);

    const osc = ctx.createOscillator();
    osc.type = str(p, 'wave') as OscillatorType;
    osc.frequency.setValueAtTime(freq, t);
    const sweep = num(p, 'sweep');
    if (sweep !== 0) {
      osc.frequency.exponentialRampToValueAtTime(freq * Math.pow(2, sweep / 12), t + num(p, 'sweepTime'));
    }

    const amp = ctx.createGain();
    const level = 0.5 * ev.velocity;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(level, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp).connect(output);
    osc.start(t);
    osc.stop(end + 0.01);
    return {
      endTime: end + 0.01,
      stop(now) {
        amp.gain.cancelScheduledValues(now);
        amp.gain.setTargetAtTime(0, now, 0.005);
        osc.stop(now + 0.05);
      },
    };
  },
};
