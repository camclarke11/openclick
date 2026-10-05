import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { peak, sanitizePatch } from '../core';
import { registry } from '../modules';
import { renderForTest } from '../test/audio';
import { CATEGORIES } from './categories';
import { findSound } from '../engines/click/library';
import { generatePatch, recipes } from './recipes';
import { sampleAssets } from './testAssets';

describe('recipes', () => {
  it('cover every category', () => {
    expect(Object.keys(recipes).sort()).toEqual([...CATEGORIES].sort());
  });

  it.each(CATEGORIES)('%s produces valid, audible, reproducible patches', async (category) => {
    for (const seed of [1, 2, 3]) {
      const p = generatePatch(registry, category, seed);
      expect(sanitizePatch(registry, p)).toEqual(p);
      expect(generatePatch(registry, category, seed)).toEqual(p);
      const audio = await renderForTest(registry, p, { assets: sampleAssets() });
      expect(peak(audio)).toBeGreaterThan(0.01);
      expect(peak(audio)).toBeLessThanOrEqual(1);
    }
  });

  it('only names samples that exist in the library', () => {
    const src = readFileSync(new URL('./recipes.ts', import.meta.url), 'utf8');
    const names = [...src.matchAll(/'((?:Switches|Keyboards|Cameras|Toys|Control panels)\/[^']+)'/g)].map(
      (m) => m[1]!,
    );
    expect(names.length).toBeGreaterThan(20);
    for (const n of names) expect(findSound(n), n).toBeDefined();
  });

  it('varies with the seed', () => {
    expect(generatePatch(registry, 'Game/Coin', 1)).not.toEqual(generatePatch(registry, 'Game/Coin', 2));
  });
});
