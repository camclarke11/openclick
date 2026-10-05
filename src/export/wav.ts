import type { RenderedAudio } from '../core';

export type BitDepth = 16 | 24 | '32f';

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * Encode PCM as a RIFF/WAVE file. 16 and 24 bit are integer PCM; '32f' is IEEE float (with the
 * `fact` chunk float WAVs require). Integer samples are clamped to [-1, 1].
 */
export function encodeWav(audio: RenderedAudio, opts: { bitDepth?: BitDepth } = {}): Uint8Array {
  const bitDepth = opts.bitDepth ?? 16;
  const channels = audio.channels.length;
  if (channels === 0) throw new Error('Cannot encode audio with no channels');
  const frames = Math.max(...audio.channels.map((c) => c.length));
  const isFloat = bitDepth === '32f';
  const bytesPerSample = isFloat ? 4 : bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const fmtSize = isFloat ? 18 : 16;
  const factSize = isFloat ? 12 : 0;
  const headerSize = 12 + 8 + fmtSize + factSize + 8;
  const buffer = new ArrayBuffer(headerSize + dataSize + (dataSize % 2));
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  writeAscii(view, 8, 'WAVE');
  let o = 12;
  writeAscii(view, o, 'fmt ');
  view.setUint32(o + 4, fmtSize, true);
  view.setUint16(o + 8, isFloat ? WAVE_FORMAT_IEEE_FLOAT : WAVE_FORMAT_PCM, true);
  view.setUint16(o + 10, channels, true);
  view.setUint32(o + 12, audio.sampleRate, true);
  view.setUint32(o + 16, audio.sampleRate * blockAlign, true);
  view.setUint16(o + 20, blockAlign, true);
  view.setUint16(o + 22, bytesPerSample * 8, true);
  if (isFloat) view.setUint16(o + 24, 0, true);
  o += 8 + fmtSize;
  if (isFloat) {
    writeAscii(view, o, 'fact');
    view.setUint32(o + 4, 4, true);
    view.setUint32(o + 8, frames, true);
    o += factSize;
  }
  writeAscii(view, o, 'data');
  view.setUint32(o + 4, dataSize, true);
  o += 8;

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = audio.channels[c]![i] ?? 0;
      if (isFloat) {
        view.setFloat32(o, v, true);
      } else {
        const s = Math.max(-1, Math.min(1, v));
        if (bitDepth === 16) {
          view.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
        } else {
          const x = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
          view.setUint8(o, x & 0xff);
          view.setUint8(o + 1, (x >> 8) & 0xff);
          view.setUint8(o + 2, (x >> 16) & 0xff);
        }
      }
      o += bytesPerSample;
    }
  }
  return new Uint8Array(buffer);
}

/** Parse a WAV produced by `encodeWav` (or any plain PCM/float WAV). Used by tests and import. */
export function decodeWav(bytes: Uint8Array): RenderedAudio & { bitDepth: BitDepth } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') throw new Error('Not a WAV file');
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let o = 12;
  while (o + 8 <= bytes.length) {
    const id = ascii(o);
    const size = view.getUint32(o + 4, true);
    if (id === 'fmt ') {
      format = view.getUint16(o + 8, true);
      channels = view.getUint16(o + 10, true);
      sampleRate = view.getUint32(o + 12, true);
      bits = view.getUint16(o + 22, true);
    } else if (id === 'data') {
      const bytesPerSample = bits / 8;
      const frames = Math.floor(size / (channels * bytesPerSample));
      const out = Array.from({ length: channels }, () => new Float32Array(frames));
      let p = o + 8;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
          let v: number;
          if (format === WAVE_FORMAT_IEEE_FLOAT) v = view.getFloat32(p, true);
          else if (bits === 16) v = view.getInt16(p, true) / 0x8000;
          else if (bits === 24) {
            const x = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16);
            v = x / 0x800000;
          } else throw new Error(`Unsupported bit depth ${bits}`);
          out[c]![i] = v;
          p += bytesPerSample;
        }
      }
      const bitDepth: BitDepth = format === WAVE_FORMAT_IEEE_FLOAT ? '32f' : (bits as 16 | 24);
      return { sampleRate, channels: out, bitDepth };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}
