import { effect, signal } from '@preact/signals';
import { bus, renderPatch, type Patch } from '../core';
import { registry } from '../modules';
import { stepSeconds } from '../arp';
import { assets, engine, patch } from '../state/store';
import { WAVE_BARS, waveformBars } from './controls';

/** Overview render settings: low rate and a short cap keep it cheap enough to run on every edit. */
const WAVE_RATE = 22050;
const WAVE_MAX_SECONDS = 4;
const WAVE_DEBOUNCE_MS = 250;

export interface Waveform {
  /** 0..1 peak per bar, normalised to the loudest bar. */
  bars: number[];
  /** Seconds of sound before the tail falls silent. */
  duration: number;
}

export const waveform = signal<Waveform>({ bars: new Array<number>(WAVE_BARS).fill(0), duration: 0 });
/** Output peak 0..1 from the engine's analyser, for the master meter. */
export const meter = signal(0);
/** Fraction of the current sound played so far, or null when nothing is playing. */
export const progress = signal<number | null>(null);
/** Arp step (0-based, over all steps) sounding now, or -1. */
export const arpStep = signal(-1);

let renderSeq = 0;

async function renderWaveform(p: Patch): Promise<void> {
  const seq = ++renderSeq;
  try {
    const audio = await renderPatch(p, {
      registry,
      assets,
      sampleRate: WAVE_RATE,
      maxSeconds: WAVE_MAX_SECONDS,
      velocity: 0.9,
    });
    if (seq !== renderSeq) return;
    const length = audio.channels[0]?.length ?? 0;
    waveform.value = { bars: waveformBars(audio.channels), duration: length / audio.sampleRate };
  } catch {
    // The overview is decoration: a failed render (missing sample, no OfflineAudioContext) keeps the last one.
  }
}

/**
 * Start the UI's audio-driven state: the waveform overview follows the patch, and while sound
 * plays a frame loop updates the meter, the waveform playhead and the arp step. Returns a stop
 * function.
 */
export function startPlayback(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const offPatch = effect(() => {
    const p = patch.value;
    clearTimeout(timer);
    timer = setTimeout(() => void renderWaveform(p), WAVE_DEBOUNCE_MS);
  });

  let started = 0;
  let frame = 0;
  let data: Float32Array<ArrayBuffer> | null = null;
  let peak = 0;
  let lastPaint = 0;

  const tick = (now: number) => {
    const analyser = engine.analyser;
    let framePeak = 0;
    if (analyser) {
      if (!data || data.length !== analyser.fftSize) data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      for (const v of data) framePeak = Math.max(framePeak, Math.abs(v));
    }
    peak = Math.max(framePeak, peak * 0.9);
    const elapsed = (now - started) / 1000;
    const dur = waveform.value.duration;
    const playing = elapsed <= dur;
    const arp = patch.value.arp;
    const arpTotal = Math.max(1, Math.round(Number(arp.steps) || 1));
    const step = arp.enabled === true ? Math.floor(elapsed / stepSeconds(arp)) : -1;

    // ~30 fps is plenty for meters and keeps re-renders cheap.
    if (now - lastPaint > 33) {
      lastPaint = now;
      meter.value = peak;
      progress.value = playing && dur > 0 ? Math.min(1, elapsed / dur) : null;
      arpStep.value = step >= 0 && step < arpTotal ? step : -1;
    }
    if (playing || peak > 0.002) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      meter.value = 0;
      progress.value = null;
      arpStep.value = -1;
    }
  };

  const offNote = bus.on('noteOn', () => {
    started = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
  });
  const offPanic = bus.on('panic', () => {
    started = -Infinity;
  });

  return () => {
    offPatch();
    offNote();
    offPanic();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  };
}
