import { describe, expect, it } from 'vitest';
import { defaultPatch, peak } from '../core';
import { registry } from '../modules';
import { createTestContext } from '../test/audio';
import { sampleAssets } from '../presets/testAssets';
import {
  defaultExportSettings,
  exportSound,
  isRobloxReady,
  mutatePatch,
  robloxExportSettings,
  slugify,
} from './exportSound';
import { decodeWav } from './wav';
import { readZip } from './zip';

const env = { registry, assets: sampleAssets(), createContext: createTestContext, maxSeconds: 1 };

describe('exportSound', () => {
  it('renders the patch to a normalised WAV named after the preset', async () => {
    const res = await exportSound(defaultPatch(registry), 'Retro Coin #2', defaultExportSettings, env);
    expect(res.fileName).toBe('retro-coin-2.wav');
    expect(res.mime).toBe('audio/wav');
    const wav = decodeWav(res.data);
    expect(wav.sampleRate).toBe(48000);
    expect(wav.channels).toHaveLength(2);
    expect(peak(wav)).toBeGreaterThan(0.85);
    expect(peak(wav)).toBeLessThanOrEqual(0.9);
    expect(wav.channels[0]!.length / 48000).toBeLessThan(0.3);
  });

  it('honours mono, 44.1 kHz and 24-bit', async () => {
    const res = await exportSound(
      defaultPatch(registry),
      'x',
      { ...defaultExportSettings, channels: 'mono', sampleRate: 44100, bitDepth: 24, normalize: false },
      env,
    );
    const wav = decodeWav(res.data);
    expect(wav.channels).toHaveLength(1);
    expect(wav.sampleRate).toBe(44100);
    expect(wav.bitDepth).toBe(24);
  });

  it('Roblox settings export a mono 16-bit WAV within Roblox upload limits', async () => {
    const s = { ...defaultExportSettings, ...robloxExportSettings };
    expect(isRobloxReady(defaultExportSettings)).toBe(false);
    expect(isRobloxReady(s)).toBe(true);
    const res = await exportSound(defaultPatch(registry), 'Coin', s, env);
    const wav = decodeWav(res.data);
    expect(wav.channels).toHaveLength(1);
    expect(wav.bitDepth).toBe(16);
    expect(wav.sampleRate).toBeLessThanOrEqual(48000);
    expect(res.data.byteLength).toBeLessThan(20 * 1024 * 1024);
    expect(peak(wav)).toBeLessThanOrEqual(0.9);
  });

  it('exports variations as a zip of distinct WAVs', async () => {
    const progress: number[] = [];
    const res = await exportSound(
      defaultPatch(registry, 'click'),
      'Tick',
      { ...defaultExportSettings, variations: 3, mutate: 0.3 },
      env,
      (done) => progress.push(done),
    );
    expect(res.fileName).toBe('tick-x3.zip');
    const files = readZip(res.data);
    expect(files.map((f) => f.name)).toEqual(['tick-1.wav', 'tick-2.wav', 'tick-3.wav']);
    expect(progress).toEqual([1, 2, 3]);
    const [a, b] = files.map((f) => decodeWav(f.data).channels[0]!);
    expect(Array.from(a!)).not.toEqual(Array.from(b!));
  });
});

describe('helpers', () => {
  it('slugifies names and never returns empty', () => {
    expect(slugify('  Café Blip!! ')).toBe('cafe-blip');
    expect(slugify('***')).toBe('sound');
  });

  it('mutatePatch is a no-op at 0 and deterministic per seed', () => {
    const p = defaultPatch(registry);
    expect(mutatePatch(registry, p, 1, 0)).toBe(p);
    expect(mutatePatch(registry, p, 5, 0.5)).toEqual(mutatePatch(registry, p, 5, 0.5));
    expect(mutatePatch(registry, p, 5, 0.5)).not.toEqual(p);
  });
});
