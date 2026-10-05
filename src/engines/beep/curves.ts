import { bool, num, steps, str, type Params } from '../../core';

/**
 * Control-rate automation for one Beep voice, computed as plain arrays so the whole voice
 * (envelopes, sweeps, sequencer, vibrato) is deterministic and unit-testable without audio.
 * The voice plays each curve with `setValueCurveAtTime`.
 */
export const CONTROL_RATE = 2000;
export const MAX_VOICE_SECONDS = 8;
/** Exponential segments fall by 60 dB over their nominal time. */
const LN1000 = Math.log(1000);
const SILENT = 1e-4;

export const SCALES: Record<string, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  octaves: [0],
};

/** Snap a semitone offset to the nearest note of a scale (C-relative to the played note). */
export function snapToScale(st: number, scale: string): number {
  const notes = SCALES[scale];
  if (!notes) return Math.round(st);
  const oct = Math.floor(st / 12);
  let best = 0;
  let dist = Infinity;
  for (const n of [...notes, 12]) {
    const d = Math.abs(st - (oct * 12 + n));
    if (d < dist) {
      dist = d;
      best = oct * 12 + n;
    }
  }
  return best;
}

export interface VoiceCurves {
  /** Seconds from note start until the voice is silent. */
  duration: number;
  /** Amplitude 0..1, velocity included. */
  amp: Float32Array;
  /** Pitch offset from the played note in cents (coarse/fine, sweep, env, vibrato, sequencer). */
  cents: Float32Array;
  /** FM frequency deviation in Hz, tracking pitch so the timbre holds across sweeps. */
  fmDepth: Float32Array;
  /** Filter cutoff in Hz. */
  cutoff: Float32Array;
  /** Step start times (seconds) when the sequencer is on. */
  stepTimes: number[];
}

export interface NoteInput {
  note: number;
  velocity: number;
  gate: number;
}

const midiToHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Sequencer steps actually played: snapped values and step start times within `length` seconds. */
function sequence(p: Params) {
  const n = num(p, 'seqLength');
  const scale = str(p, 'seqScale');
  return {
    values: steps(p, 'seqSteps')
      .slice(0, n)
      .map((v) => snapToScale(v, scale)),
    stepTime: num(p, 'seqRate'),
    loop: bool(p, 'seqLoop'),
    mode: str(p, 'seqMode'),
  };
}

export function buildCurves(p: Params, ev: NoteInput, sampleRate = 48000): VoiceCurves {
  const seqOn = bool(p, 'seqOn');
  const seq = seqOn ? sequence(p) : null;
  // A one-shot sequence holds the note at least until its last step has played.
  const gate = Math.max(
    ev.gate,
    seq && !seq.loop ? seq.values.length * seq.stepTime : 0,
    num(p, 'attack') + num(p, 'hold'),
  );
  const release = num(p, 'release');
  const total = Math.min(MAX_VOICE_SECONDS, gate + release);
  const len = Math.max(2, Math.ceil(total * CONTROL_RATE) + 1);

  const amp = new Float32Array(len);
  const cents = new Float32Array(len);
  const fmDepth = new Float32Array(len);
  const cutoff = new Float32Array(len);

  const attack = num(p, 'attack');
  const hold = num(p, 'hold');
  const decay = num(p, 'decay');
  const sustain = num(p, 'sustain');
  const velLevel = 1 - num(p, 'velToLevel') * (1 - ev.velocity);

  const base = num(p, 'coarse') * 100 + num(p, 'fine');
  const sweep = num(p, 'sweep') * 100;
  const sweepTime = num(p, 'sweepTime');
  const sweepExp = str(p, 'sweepCurve') === 'exp';
  const penv = num(p, 'pitchEnv') * 100;
  const pAtt = num(p, 'pitchAttack');
  const pDec = num(p, 'pitchDecay');
  const vibRate = num(p, 'vibratoRate');
  const vibDepth = num(p, 'vibratoDepth');
  const vibDelay = num(p, 'vibratoDelay');

  const modBase = midiToHz(ev.note) * num(p, 'fmRatio');
  const fmIndex = num(p, 'fmIndex');
  const fmDecay = num(p, 'fmDecay');

  const nyquist = sampleRate / 2;
  const cut = num(p, 'cutoff') * Math.pow(2, -num(p, 'velToBright') * (1 - ev.velocity) * 4);
  const fEnv = num(p, 'filterEnv');
  const fDec = num(p, 'filterDecay');

  const retrigger = seq?.mode === 'retrigger';
  const glide = seq?.mode === 'glide';
  const glideCoef = seq ? 1 - Math.exp(-1 / (CONTROL_RATE * seq.stepTime * 0.3)) : 0;
  const stepTimes: number[] = [];

  let lastStep = -1;
  let trigT = 0; // start of the current (re)triggered note
  let trigLevel = 0; // amp level when it was retriggered
  let level = 0;
  let relLevel = -1;
  let seqCents = seq ? (seq.values[0] ?? 0) * 100 : 0;

  for (let k = 0; k < len; k++) {
    const t = k / CONTROL_RATE;

    // Sequencer step and retrigger.
    if (seq && seq.values.length > 0) {
      const raw = Math.floor(t / seq.stepTime);
      const idx = seq.loop ? raw % seq.values.length : Math.min(raw, seq.values.length - 1);
      if (raw !== lastStep && (seq.loop || raw < seq.values.length) && t < gate) {
        stepTimes.push(raw * seq.stepTime);
        if (retrigger && raw > 0) {
          trigT = raw * seq.stepTime;
          trigLevel = level;
        }
      }
      lastStep = raw;
      const target = seq.values[idx]! * 100;
      seqCents = glide ? seqCents + (target - seqCents) * glideCoef : target;
    }
    const u = t - trigT;

    // Amp: AHDS while the gate is held, then release from wherever it got to.
    if (t < gate) {
      if (u < attack) level = trigLevel + (1 - trigLevel) * (u / attack);
      else if (u < attack + hold) level = 1;
      else level = sustain + (1 - sustain) * Math.exp((-LN1000 * (u - attack - hold)) / decay);
    } else {
      if (relLevel < 0) relLevel = level;
      level = t >= gate + release ? 0 : relLevel * Math.exp((-LN1000 * (t - gate)) / release);
    }
    amp[k] = level * velLevel;

    // Pitch.
    let c = base + seqCents;
    if (sweep !== 0 && u < sweepTime) {
      const x = u / sweepTime;
      c += sweep * (sweepExp ? (Math.exp(-5 * x) - Math.exp(-5)) / (1 - Math.exp(-5)) : 1 - x);
    }
    if (penv !== 0) c += penv * (u < pAtt ? u / pAtt : Math.exp((-LN1000 * (u - pAtt)) / pDec));
    if (vibDepth > 0 && t > vibDelay) {
      const fade = Math.min(1, (t - vibDelay) / 0.1);
      c += vibDepth * fade * Math.sin(2 * Math.PI * vibRate * (t - vibDelay));
    }
    cents[k] = c;

    fmDepth[k] =
      fmIndex > 0 ? fmIndex * Math.exp((-LN1000 * u) / fmDecay) * modBase * Math.pow(2, c / 1200) : 0;

    const fc = cut * Math.pow(2, fEnv * Math.exp((-LN1000 * u) / fDec));
    cutoff[k] = Math.min(nyquist * 0.95, Math.max(20, fc));
  }

  // Trim to the last audible control point.
  let last = len - 1;
  while (last > 1 && amp[last]! < SILENT) last--;
  const end = Math.min(len, last + 2);
  const ampOut = amp.slice(0, end);
  ampOut[end - 1] = 0;
  return {
    duration: (end - 1) / CONTROL_RATE,
    amp: ampOut,
    cents: cents.slice(0, end),
    fmDepth: fmDepth.slice(0, end),
    cutoff: cutoff.slice(0, end),
    stepTimes,
  };
}
