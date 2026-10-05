import { describe, expect, it } from 'vitest';
import { peak, sanitizePatch } from '../core';
import { registry } from '../modules';
import { renderForTest } from '../test/audio';
import { CATEGORIES } from './categories';
import { generatePatch, recipes } from './recipes';

describe('recipes', () => {
  it('cover every category', () => {
    expect(Object.keys(recipes).sort()).toEqual([...CATEGORIES].sort());
  });

  it.each(CATEGORIES)('%s produces valid, audible, reproducible patches', async (category) => {
    for (const seed of [1, 2, 3]) {
      const p = generatePatch(registry, category, seed);
      expect(sanitizePatch(registry, p)).toEqual(p);
      expect(generatePatch(registry, category, seed)).toEqual(p);
      const audio = await renderForTest(registry, p);
      expect(peak(audio)).toBeGreaterThan(0.01);
      expect(peak(audio)).toBeLessThanOrEqual(1);
    }
  });

  it('varies with the seed', () => {
    expect(generatePatch(registry, 'Game/Coin', 1)).not.toEqual(generatePatch(registry, 'Game/Coin', 2));
  });
});
