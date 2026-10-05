import { describe, expect, it } from 'vitest';
import { makePreset } from '../presets/library';
import { factoryPresets } from '../presets/factory';
import { sampleAssets } from '../presets/testAssets';
import { registry } from '../modules';
import { createTestContext } from '../test/audio';
import { defaultPatch, peak } from '../core';
import { defaultExportSettings, robloxExportSettings } from './exportSound';
import { exportPack, packPaths } from './pack';
import { decodeWav } from './wav';
import { readZip } from './zip';

const env = { registry, assets: sampleAssets(), createContext: createTestContext, maxSeconds: 1 };

const preset = (name: string, category: string) =>
  makePreset({ id: name, name, category, tags: [], patch: defaultPatch(registry) });

describe('packPaths', () => {
  it('puts each sound in a folder per category and keeps names unique', () => {
    const paths = packPaths(
      [
        preset('Coin', 'Game/Coin'),
        preset('Coin', 'Game/Coin'),
        preset('Blip!', 'Game/Power-up'),
        preset('x', ''),
      ],
      'pack',
    );
    expect(paths).toEqual([
      'pack/Game/Coin/coin.wav',
      'pack/Game/Coin/coin-2.wav',
      'pack/Game/Power-up/blip.wav',
      'pack/Other/x.wav',
    ]);
  });
});

describe('exportPack', () => {
  it('zips one rendered WAV per factory preset plus a README', async () => {
    const presets = factoryPresets.filter((p) => p.tags.includes('roblox')).slice(0, 6);
    const progress: number[] = [];
    const res = await exportPack(
      presets,
      'Sounds Roblox pack',
      { ...defaultExportSettings, ...robloxExportSettings, variations: 8, mutate: 0.5 },
      env,
      (done) => progress.push(done),
    );
    expect(res.fileName).toBe('sounds-roblox-pack.zip');
    expect(res.count).toBe(6);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    const files = readZip(res.data);
    expect(files.map((f) => f.name)).toEqual([
      'sounds-roblox-pack/README.txt',
      ...packPaths(presets, 'sounds-roblox-pack'),
    ]);
    expect(new TextDecoder().decode(files[0]!.data)).toContain('16-bit, 48 kHz, mono');
    for (const f of files.slice(1)) {
      const wav = decodeWav(f.data);
      expect(wav.channels).toHaveLength(1);
      expect(peak(wav)).toBeGreaterThan(0.8);
    }
  });

  it('does not finish when aborted during the last render', async () => {
    const ctrl = new AbortController();
    const slow = {
      ...env,
      createContext: (c: number, l: number, r: number) => (ctrl.abort(), createTestContext(c, l, r)),
    };
    await expect(
      exportPack(factoryPresets.slice(0, 1), 'x', defaultExportSettings, slow, undefined, ctrl.signal),
    ).rejects.toThrow();
  });

  it('stops when aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      exportPack(factoryPresets.slice(0, 2), 'x', defaultExportSettings, env, undefined, ctrl.signal),
    ).rejects.toThrow();
  });
});
