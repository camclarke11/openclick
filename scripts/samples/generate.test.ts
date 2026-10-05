import { readFileSync } from 'node:fs';
import { OfflineAudioContext } from 'node-web-audio-api';
import { describe, expect, it } from 'vitest';
import { encodeWav16, generateLibrary, SAMPLE_RATE } from './generate';

const root = new URL('../../', import.meta.url);

describe('placeholder sample generator', () => {
  const { manifest, files } = generateLibrary();

  it('labels every sound as placeholder and stays small', () => {
    expect(manifest.placeholder).toBe(true);
    const sounds = manifest.categories.flatMap((c) => c.sounds);
    expect(sounds.length).toBeGreaterThanOrEqual(25);
    for (const s of sounds) {
      expect(s.placeholder).toBe(true);
      expect(s.license).toBe('CC0-1.0');
    }
    const bytes = files.reduce((n, f) => n + 44 + f.samples.length * 2, 0);
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
  });

  it('produces non-silent, unclipped, short samples', () => {
    for (const f of files) {
      let p = 0;
      for (const v of f.samples) p = Math.max(p, Math.abs(v));
      expect(p, f.path).toBeGreaterThan(0.5);
      expect(p, f.path).toBeLessThan(1);
      expect(f.samples.length / SAMPLE_RATE, f.path).toBeLessThan(1);
    }
  });

  it('writes WAVs that decode as mono 48 kHz', async () => {
    const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: SAMPLE_RATE });
    const f = files[0]!;
    const wav = encodeWav16(f.samples);
    const buf = await ctx.decodeAudioData(wav.buffer as ArrayBuffer);
    expect(buf.numberOfChannels).toBe(1);
    expect(buf.sampleRate).toBe(SAMPLE_RATE);
    expect(buf.length).toBe(f.samples.length);
    expect(buf.getChannelData(0)[100]).toBeCloseTo(f.samples[100]!, 3);
  });

  it('matches the committed manifest and files (re-run the script after changing recipes)', () => {
    const committed = JSON.parse(readFileSync(new URL('src/engines/click/manifest.json', root), 'utf8'));
    expect(committed).toEqual(manifest);
    for (const f of files) {
      const onDisk = readFileSync(new URL(`public/samples/${f.path}`, root));
      expect(Buffer.from(encodeWav16(f.samples)).equals(onDisk), f.path).toBe(true);
    }
  });
});
