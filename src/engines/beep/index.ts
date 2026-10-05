import { midiToHz, num, str, type SourceModule } from '../../core';
import { buildCurves, CONTROL_RATE } from './curves';
import { getNoiseBuffer } from './noise';
import { beepSchema } from './schema';
import { createSpeaker } from './speaker';
import { getWave } from './wave';

/** Headroom so the oscillator, noise and filter resonance stay under 0 dBFS. */
const VOICE_LEVEL = 0.5;

/**
 * Beep: the synth source. One voice is a variable-shape oscillator with optional FM and a noise
 * generator, through a filter, an AHDSR amp and a speaker model:
 *
 *   modulator ─► carrier.frequency
 *   carrier ─► osc level ─┐
 *   noise ─► tone ─► lvl ─┴► mix ─► filter ─► amp ─► speaker ─► kill ─► output
 *
 * Pitch (sweep, envelope, vibrato, step sequencer), amp, FM depth and cutoff are precomputed as
 * control-rate curves by `buildCurves`, so the voice only schedules them.
 */
export const beepSource: SourceModule = {
  type: 'beep',
  label: 'Beep',
  schema: beepSchema,
  createVoice({ ctx, output, rng }, p, ev) {
    const t = ev.time;
    const curves = buildCurves(p, ev, ctx.sampleRate);
    const dur = Math.max(curves.duration, 1 / CONTROL_RATE);
    const end = t + dur;
    const freq = midiToHz(ev.note);
    const sources: AudioScheduledSourceNode[] = [];

    const oscLevel = num(p, 'oscLevel');
    const noiseLevel = num(p, 'noiseLevel');
    const mix = ctx.createGain();
    mix.gain.value = VOICE_LEVEL / Math.max(1, oscLevel + noiseLevel);

    if (oscLevel > 0) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(getWave(ctx, num(p, 'shape'), num(p, 'pulseWidth')));
      osc.frequency.value = freq;
      osc.detune.setValueCurveAtTime(curves.cents, t, dur);
      if (num(p, 'fmIndex') > 0) {
        const mod = ctx.createOscillator();
        mod.frequency.value = freq * num(p, 'fmRatio');
        mod.detune.setValueCurveAtTime(curves.cents, t, dur);
        const depth = ctx.createGain();
        depth.gain.value = 0;
        depth.gain.setValueCurveAtTime(curves.fmDepth, t, dur);
        mod.connect(depth).connect(osc.frequency);
        mod.start(t);
        sources.push(mod);
      }
      const g = ctx.createGain();
      g.gain.value = oscLevel;
      osc.connect(g).connect(mix);
      osc.start(t);
      sources.push(osc);
    }

    if (noiseLevel > 0) {
      const type = str(p, 'noiseType');
      const src = ctx.createBufferSource();
      src.buffer = getNoiseBuffer(ctx, type);
      src.loop = true;
      if (type.startsWith('chip')) {
        // Chip noise is pitched: it follows the note and every pitch movement.
        src.playbackRate.value = Math.pow(2, (ev.note - 60) / 12);
        src.detune.setValueCurveAtTime(curves.cents, t, dur);
      }
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = Math.min(num(p, 'noiseFilter'), ctx.sampleRate * 0.45);
      const g = ctx.createGain();
      g.gain.value = noiseLevel;
      src.connect(tone).connect(g).connect(mix);
      src.start(t, rng.next() * src.buffer.duration);
      sources.push(src);
    }

    const filter = ctx.createBiquadFilter();
    const ftype = str(p, 'filterType') as BiquadFilterType;
    filter.type = ftype;
    const res = num(p, 'resonance');
    // Web Audio reads low/high-pass Q in dB; band-pass Q is linear.
    filter.Q.value = ftype === 'bandpass' ? res : 20 * Math.log10(res);
    filter.frequency.setValueCurveAtTime(curves.cutoff, t, dur);

    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.gain.setValueCurveAtTime(curves.amp, t, dur);

    mix.connect(filter).connect(amp);
    const speaker = createSpeaker(ctx, amp, str(p, 'speaker'), num(p, 'speakerAmount'));
    const kill = ctx.createGain();
    speaker.connect(kill).connect(output);

    const stopAt = end + 0.01;
    for (const s of sources) s.stop(stopAt);
    return {
      endTime: stopAt,
      stop(now) {
        kill.gain.cancelScheduledValues(now);
        kill.gain.setTargetAtTime(0, now, 0.005);
        for (const s of sources) {
          try {
            s.stop(Math.min(stopAt, now + 0.05));
          } catch {
            // already stopped
          }
        }
      },
    };
  },
};
