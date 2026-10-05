import { bool, num, str, type ParamSchema, type Params, type Rng, type SourceModule } from '../../core';
import { findSound, library, type LibrarySound } from './library';

/**
 * Click sample engine: plays one-shots from the sample library (see library.ts) with pitch,
 * start offset, length, reverse, round robins, an amp envelope and a filter.
 */
const soundKeys = library.map((s) => s.key);
const DEFAULT_SOUND = soundKeys.includes('Switches/Toggle') ? 'Switches/Toggle' : (soundKeys[0] ?? '');

export const clickSchema = {
  sound: {
    kind: 'enum',
    label: 'Sound',
    group: 'Sample',
    options: soundKeys,
    default: DEFAULT_SOUND,
    hint: library.some((s) => s.placeholder)
      ? 'Placeholder library: synthesised stand-ins until the recorded library lands'
      : undefined,
  },
  roundRobin: {
    kind: 'enum',
    label: 'Round robin',
    group: 'Sample',
    options: ['cycle', 'random', 'fixed'],
    default: 'cycle',
    hint: 'How each hit picks a take: in turn, at random (never the same twice), or always one',
  },
  variation: {
    kind: 'number',
    label: 'Take',
    group: 'Sample',
    min: 1,
    max: 8,
    default: 1,
    step: 1,
    hint: 'Which take plays when round robin is fixed',
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
    randomRange: [-7, 7],
  },
  fine: { kind: 'number', label: 'Fine', group: 'Pitch', min: -100, max: 100, default: 0, unit: 'ct' },
  keyFollow: {
    kind: 'bool',
    label: 'Key follow',
    group: 'Pitch',
    default: true,
    randomize: false,
    hint: 'Played note changes pitch (middle C plays the sample as recorded)',
  },
  humanize: {
    kind: 'number',
    label: 'Humanize',
    group: 'Pitch',
    min: 0,
    max: 100,
    default: 0,
    unit: '%',
    randomRange: [0, 40],
    hint: 'Random pitch (up to ±50 ct) and level (up to ±3 dB) per hit',
  },
  start: {
    kind: 'number',
    label: 'Start',
    group: 'Playback',
    min: 0,
    max: 250,
    default: 0,
    unit: 'ms',
    randomRange: [0, 8],
    hint: 'Skip into the sample',
  },
  length: {
    kind: 'number',
    label: 'Length',
    group: 'Playback',
    min: 0.005,
    max: 4,
    default: 4,
    curve: 'log',
    unit: 's',
    randomRange: [0.08, 4],
    hint: 'Cut the sample short (playback time, after pitch)',
  },
  reverse: { kind: 'bool', label: 'Reverse', group: 'Playback', default: false, randomize: false },
  followGate: {
    kind: 'bool',
    label: 'Follow gate',
    group: 'Playback',
    default: false,
    randomize: false,
    hint: 'Cut the sample at the end of the note (e.g. the arpeggiator note length lane)',
  },
  attack: {
    kind: 'number',
    label: 'Attack',
    group: 'Amp',
    min: 0,
    max: 0.2,
    default: 0,
    unit: 's',
    randomRange: [0, 0.004],
  },
  fade: {
    kind: 'number',
    label: 'Fade',
    group: 'Amp',
    min: 0.001,
    max: 1,
    default: 0.005,
    curve: 'log',
    unit: 's',
    randomRange: [0.002, 0.05],
    hint: 'Fade-out at the end of the (possibly shortened) sample',
  },
  velocity: {
    kind: 'number',
    label: 'Velocity',
    group: 'Amp',
    min: 0,
    max: 100,
    default: 70,
    unit: '%',
    randomize: false,
    hint: 'How much note velocity changes level',
  },
  filter: {
    kind: 'enum',
    label: 'Filter',
    group: 'Filter',
    options: ['off', 'lowpass', 'highpass', 'bandpass'],
    default: 'off',
  },
  cutoff: {
    kind: 'number',
    label: 'Cutoff',
    group: 'Filter',
    min: 20,
    max: 20000,
    default: 8000,
    curve: 'log',
    unit: 'Hz',
    randomRange: [1500, 12000],
  },
  resonance: {
    kind: 'number',
    label: 'Resonance',
    group: 'Filter',
    min: 0.1,
    max: 20,
    default: 0.7,
    curve: 'log',
    randomRange: [0.5, 4],
  },
} satisfies ParamSchema;

/** Round robin position per context, so every offline render starts from the first take. */
const rrState = new WeakMap<BaseAudioContext, Map<string, number>>();

function pickTake(ctx: BaseAudioContext, sound: LibrarySound, p: Params, rng: Rng): number {
  const n = sound.files.length;
  const mode = str(p, 'roundRobin');
  if (mode === 'fixed' || n === 1) return (Math.round(num(p, 'variation')) - 1) % n;
  let state = rrState.get(ctx);
  if (!state) rrState.set(ctx, (state = new Map()));
  const last = state.get(sound.key);
  let take: number;
  if (mode === 'random') {
    // Never repeat the previous take, like a player alternating real recordings.
    take = last === undefined ? rng.int(0, n - 1) : (last + rng.int(1, n - 1)) % n;
  } else {
    take = last === undefined ? 0 : (last + 1) % n;
  }
  state.set(sound.key, take);
  return take;
}

const reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();

function reversed(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  let out = reversedCache.get(buf);
  if (!out) {
    out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.copyToChannel(buf.getChannelData(c).slice().reverse(), c);
    }
    reversedCache.set(buf, out);
  }
  return out;
}

export const clickSource: SourceModule = {
  type: 'click',
  label: 'Click',
  schema: clickSchema,

  async prepare(params, ctx, assets) {
    const sound = findSound(str(params, 'sound'));
    if (!sound) return;
    try {
      await assets.load(sound.files, ctx);
    } catch (err) {
      // A missing file should cost one silent sound, not break the engine.
      console.warn(err);
    }
  },

  createVoice({ ctx, output, rng, assets }, p, ev) {
    const t = ev.time;
    const sound = findSound(str(p, 'sound'));
    if (!sound) return { endTime: t };
    const take = pickTake(ctx, sound, p, rng);
    const loaded = assets.get(sound.files[take]!);
    // Not loaded yet (prepare still running) or failed: stay silent rather than throw.
    if (!loaded) return { endTime: t };
    const buffer = bool(p, 'reverse') ? reversed(ctx, loaded) : loaded;

    const humanize = num(p, 'humanize') / 100;
    const semis =
      (bool(p, 'keyFollow') ? ev.note - 60 : 0) +
      num(p, 'pitch') +
      num(p, 'fine') / 100 +
      (humanize > 0 ? rng.range(-0.5, 0.5) * humanize : 0);
    const rate = Math.pow(2, semis / 12);
    const offset = Math.min(num(p, 'start') / 1000, buffer.duration * 0.99);
    const natural = (buffer.duration - offset) / rate;
    const dur = Math.min(
      natural,
      num(p, 'length'),
      bool(p, 'followGate') ? Math.max(ev.gate, 0.005) : Infinity,
    );
    const attack = Math.min(num(p, 'attack'), dur / 2);
    const fade = Math.min(num(p, 'fade'), dur / 2);
    const sens = num(p, 'velocity') / 100;
    const jitterDb = humanize > 0 ? rng.range(-3, 3) * humanize : 0;
    const level = (1 - sens + sens * ev.velocity) * Math.pow(10, jitterDb / 20);
    const end = t + dur;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const amp = ctx.createGain();
    if (attack > 0) {
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(level, t + attack);
    } else {
      amp.gain.setValueAtTime(level, t);
    }
    amp.gain.setValueAtTime(level, end - fade);
    amp.gain.linearRampToValueAtTime(0, end);

    let node: AudioNode = src;
    const filterType = str(p, 'filter');
    if (filterType !== 'off') {
      const filter = ctx.createBiquadFilter();
      filter.type = filterType as BiquadFilterType;
      filter.frequency.value = num(p, 'cutoff');
      filter.Q.value = num(p, 'resonance');
      node = node.connect(filter);
    }
    node.connect(amp).connect(output);
    src.start(t, offset);
    src.stop(end + 0.001);
    return {
      endTime: end + 0.001,
      stop(now) {
        amp.gain.cancelScheduledValues(now);
        amp.gain.setTargetAtTime(0, now, 0.005);
        try {
          src.stop(now + 0.05);
        } catch {
          // Already stopped.
        }
      },
    };
  },
};
