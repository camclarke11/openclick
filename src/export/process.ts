import { peak, type RenderedAudio } from '../core';

/** Average all channels into one. */
export function toMono(audio: RenderedAudio): RenderedAudio {
  const n = audio.channels.length;
  if (n <= 1) return audio;
  const length = Math.max(...audio.channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (const ch of audio.channels) for (let i = 0; i < ch.length; i++) out[i]! += ch[i]! / n;
  return { sampleRate: audio.sampleRate, channels: [out] };
}

/** Scale so the loudest sample sits at `targetDb` dBFS. Silence is returned unchanged. */
export function normalize(audio: RenderedAudio, targetDb = -1): RenderedAudio {
  const p = peak(audio);
  if (p === 0) return audio;
  const k = Math.pow(10, targetDb / 20) / p;
  return { sampleRate: audio.sampleRate, channels: audio.channels.map((ch) => ch.map((v) => v * k)) };
}
