/**
 * Small-speaker models: band-limiting filters, cone/piezo resonances and a soft clipper, with a
 * makeup gain so switching models keeps roughly the same loudness.
 */
interface Band {
  type: BiquadFilterType;
  freq: number;
  q: number;
  gain?: number;
}

export interface SpeakerModel {
  bands: Band[];
  /** Soft-clip drive; higher is more distorted. */
  drive: number;
  makeup: number;
}

export const SPEAKERS: Record<string, SpeakerModel> = {
  phone: {
    bands: [
      { type: 'highpass', freq: 380, q: 0.9 },
      { type: 'peaking', freq: 1800, q: 1.4, gain: 6 },
      { type: 'peaking', freq: 3600, q: 2, gain: 4 },
      { type: 'lowpass', freq: 7000, q: 0.7 },
    ],
    drive: 2,
    makeup: 0.9,
  },
  laptop: {
    bands: [
      { type: 'highpass', freq: 220, q: 0.8 },
      { type: 'peaking', freq: 900, q: 1, gain: 4 },
      { type: 'peaking', freq: 4200, q: 1.5, gain: 3 },
      { type: 'lowpass', freq: 11000, q: 0.7 },
    ],
    drive: 1.5,
    makeup: 1,
  },
  piezo: {
    bands: [
      { type: 'highpass', freq: 1500, q: 1.8 },
      { type: 'peaking', freq: 3200, q: 4, gain: 12 },
      { type: 'lowpass', freq: 8000, q: 1 },
    ],
    drive: 4,
    makeup: 0.8,
  },
  handheld: {
    bands: [
      { type: 'highpass', freq: 300, q: 1 },
      { type: 'peaking', freq: 1200, q: 1.2, gain: 5 },
      { type: 'lowpass', freq: 4500, q: 1.2 },
    ],
    drive: 2.5,
    makeup: 0.9,
  },
  tv: {
    bands: [
      { type: 'highpass', freq: 120, q: 0.8 },
      { type: 'peaking', freq: 450, q: 0.8, gain: 3 },
      { type: 'peaking', freq: 2500, q: 1, gain: 5 },
      { type: 'lowpass', freq: 7000, q: 0.8 },
    ],
    drive: 1.8,
    makeup: 1,
  },
};

/** tanh soft clip normalised so ±1 in gives ±1 out. */
export function softClipCurve(drive: number, size = 1024): Float32Array {
  const out = new Float32Array(size);
  const norm = Math.tanh(drive);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    out[i] = Math.tanh(drive * x) / norm;
  }
  return out;
}

const curves = new Map<number, Float32Array<ArrayBuffer>>();

/** Wire `input` through the model (blended with the dry signal by `amount`); returns the output node. */
export function createSpeaker(
  ctx: BaseAudioContext,
  input: AudioNode,
  model: string,
  amount: number,
): AudioNode {
  const m = SPEAKERS[model];
  if (!m || amount <= 0) return input;
  const out = ctx.createGain();
  if (amount < 1) {
    const dry = ctx.createGain();
    dry.gain.value = 1 - amount;
    input.connect(dry).connect(out);
  }
  let prev: AudioNode = input;
  for (const b of m.bands) {
    const f = ctx.createBiquadFilter();
    f.type = b.type;
    f.frequency.value = b.freq;
    // Web Audio reads low/high-pass Q in dB and peaking Q as bandwidth.
    f.Q.value = b.type === 'lowpass' || b.type === 'highpass' ? 20 * Math.log10(b.q) : b.q;
    if (b.gain) f.gain.value = b.gain;
    prev.connect(f);
    prev = f;
  }
  let curve = curves.get(m.drive);
  if (!curve) curves.set(m.drive, (curve = softClipCurve(m.drive) as Float32Array<ArrayBuffer>));
  const shaper = ctx.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = '2x';
  const wet = ctx.createGain();
  wet.gain.value = amount * m.makeup;
  prev.connect(shaper).connect(wet).connect(out);
  return out;
}
