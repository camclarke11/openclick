import { SoundGraph } from './graph';
import type { Patch } from './patch';
import { createRng } from './rng';
import type { AssetStore, Registry } from './types';

/** Plain PCM, independent of any AudioContext. Input to the WAV encoder. */
export interface RenderedAudio {
  sampleRate: number;
  channels: Float32Array[];
}

export interface RenderOptions {
  registry: Registry;
  assets: AssetStore;
  note?: number;
  velocity?: number;
  sampleRate?: number;
  /** Upper bound; output is trimmed to the end of the sound. */
  maxSeconds?: number;
  /** Fixed seed so exports are reproducible. */
  seed?: number;
  /** Below this level (dBFS) the tail counts as silence and is trimmed. */
  silenceDb?: number;
  /** Injected in tests (node-web-audio-api). Defaults to the browser's OfflineAudioContext. */
  createContext?: (channels: number, length: number, sampleRate: number) => OfflineAudioContext;
}

const defaultContext = (channels: number, length: number, sampleRate: number) =>
  new OfflineAudioContext({ numberOfChannels: channels, length, sampleRate });

/** Render one played note of a patch offline, through the same graph the pads use. */
export async function renderPatch(patch: Patch, opts: RenderOptions): Promise<RenderedAudio> {
  const sampleRate = opts.sampleRate ?? 48000;
  const maxSeconds = opts.maxSeconds ?? 8;
  const ctx = (opts.createContext ?? defaultContext)(2, Math.ceil(maxSeconds * sampleRate), sampleRate);
  const graph = new SoundGraph(ctx, ctx.destination, {
    registry: opts.registry,
    assets: opts.assets,
    rng: createRng(opts.seed ?? 1),
  });
  await graph.prepare(patch);
  graph.setPatch(patch);
  graph.trigger(opts.note ?? 60, opts.velocity ?? 1, 0);
  const buffer = await ctx.startRendering();
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return trimSilence({ sampleRate, channels }, opts.silenceDb ?? -70);
}

/** Cut trailing silence and apply a short fade so the file ends cleanly. */
export function trimSilence(audio: RenderedAudio, silenceDb = -70): RenderedAudio {
  const threshold = Math.pow(10, silenceDb / 20);
  let last = 0;
  for (const ch of audio.channels) {
    for (let i = ch.length - 1; i > last; i--) {
      if (Math.abs(ch[i]!) > threshold) {
        last = i;
        break;
      }
    }
  }
  const fade = Math.min(Math.floor(audio.sampleRate * 0.005), last);
  const length = last + 1 + fade;
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((ch) => {
      const out = ch.slice(0, Math.min(length, ch.length));
      for (let i = 0; i < fade; i++) {
        const j = out.length - fade + i;
        out[j] = out[j]! * (1 - i / fade);
      }
      return out;
    }),
  };
}

export function peak(audio: RenderedAudio): number {
  let p = 0;
  for (const ch of audio.channels) for (const v of ch) p = Math.max(p, Math.abs(v));
  return p;
}
