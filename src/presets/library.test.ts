import { describe, expect, it } from 'vitest';
import {
  defaultPatch,
  layerMixSchema,
  parsePreset,
  peak,
  sanitizeParam,
  type ParamSchema,
  type Params,
  type Patch,
} from '../core';
import { registry } from '../modules';
import { renderForTest } from '../test/audio';
import { CATEGORIES, categoryTree, TAGS } from './categories';
import { factoryPresets } from './factory';
import {
  createUserPresetStore,
  filterPresets,
  loadPresetFiles,
  makePreset,
  parsePresetFile,
  presetToJson,
  stepPreset,
  USER_PRESETS_KEY,
} from './library';
import { sampleAssets } from './testAssets';

const preset = (id: string, name: string, category: string, tags: string[] = []) =>
  makePreset({ id, name, category, tags, patch: defaultPatch(registry) });

describe('factory presets', () => {
  it('loads every file in presets/', () => {
    expect(factoryPresets.length).toBeGreaterThan(0);
    expect(new Set(factoryPresets.map((p) => p.id)).size).toBe(factoryPresets.length);
  });

  it.each(factoryPresets.map((p) => [p.id, p] as const))('%s is valid and renders sound', async (_id, p) => {
    expect(parsePreset(registry, JSON.parse(presetToJson(p)))).toEqual(p);
    expect(CATEGORIES as readonly string[]).toContain(p.category);
    for (const t of p.tags) expect(TAGS as readonly string[]).toContain(t);
    const audio = await renderForTest(registry, p.patch, { assets: sampleAssets() });
    expect(peak(audio)).toBeGreaterThan(0.01);
    expect(peak(audio)).toBeLessThanOrEqual(1);
  });
});

describe('factory preset files', () => {
  const raw = import.meta.glob<Record<string, unknown>>('../../presets/*.json', {
    eager: true,
    import: 'default',
  });

  it.each(Object.entries(raw))('%s uses only real params, in range', (_path, json) => {
    const patch = json.patch as Patch;
    const check = (schema: ParamSchema, params: Params, where: string) => {
      for (const [key, value] of Object.entries(params)) {
        const spec = schema[key];
        expect(spec, `${where}.${key} is not a param`).toBeDefined();
        const clean = sanitizeParam(spec!, value);
        // Stepped params can round-trip with float noise (0.7 -> 0.7000000000000001).
        if (typeof value === 'number')
          expect(clean as number, `${where}.${key} out of range`).toBeCloseTo(value, 9);
        else expect(clean, `${where}.${key} out of range`).toEqual(value);
      }
    };
    patch.layers.forEach((l, i) => {
      expect(registry.sources.has(l.source)).toBe(true);
      check(registry.sources.get(l.source)!.schema, l.params, `layer ${i}`);
      check(layerMixSchema, l.mix, `layer ${i} mix`);
    });
    patch.fx.forEach((f, i) => {
      expect(registry.effects.has(f.type), `fx ${f.type}`).toBe(true);
      check(registry.effects.get(f.type)!.schema, f.params, `fx ${i}`);
    });
    check(registry.arp.schema, patch.arp, 'arp');
  });

  it('has at least three presets in every category', () => {
    for (const c of CATEGORIES) {
      expect(factoryPresets.filter((p) => p.category === c).length, c).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('loadPresetFiles', () => {
  it('skips broken files and sorts by category order then name', () => {
    const errors: string[] = [];
    const list = loadPresetFiles(
      registry,
      {
        'presets/b.json': preset('b', 'Zed', 'Game/Coin'),
        'presets/a.json': preset('a', 'Alpha', 'Game/Coin'),
        'presets/c.json': preset('c', 'Click', 'UI/Click'),
        'presets/bad.json': { nope: true },
      },
      (path) => errors.push(path),
    );
    expect(list.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(errors).toEqual(['presets/bad.json']);
  });
});

describe('filterPresets', () => {
  const list = [
    preset('1', 'Retro Coin', 'Game/Coin', ['retro', 'chiptune']),
    preset('2', 'Soft Tap', 'UI/Tap', ['soft']),
    preset('3', 'Big Boom', 'Game/Explosion', ['harsh']),
  ];
  const ids = (f: Parameters<typeof filterPresets>[1]) => filterPresets(list, f).map((p) => p.id);

  it('filters by group, category, tags and search words', () => {
    expect(ids({ category: 'Game' })).toEqual(['1', '3']);
    expect(ids({ category: 'Game/Coin' })).toEqual(['1']);
    expect(ids({ tags: ['retro', 'chiptune'] })).toEqual(['1']);
    expect(ids({ tags: ['retro', 'soft'] })).toEqual([]);
    expect(ids({ query: 'boom game' })).toEqual(['3']);
    expect(ids({ query: 'SOFT' })).toEqual(['2']);
    expect(ids({})).toEqual(['1', '2', '3']);
  });

  it('steps through a list with wrap-around', () => {
    expect(stepPreset(list, '1', 1)?.id).toBe('2');
    expect(stepPreset(list, '1', -1)?.id).toBe('3');
    expect(stepPreset(list, 'missing', 1)?.id).toBe('1');
    expect(stepPreset([], '1', 1)).toBeNull();
  });
});

describe('categoryTree', () => {
  it('lists every plan category with counts, plus extras', () => {
    const tree = categoryTree(['Game/Coin', 'Game/Coin', 'UI/Tap', 'Custom/Thing']);
    expect(tree.map((g) => g.group)).toEqual(['UI', 'Foley', 'Game', 'Custom']);
    const game = tree.find((g) => g.group === 'Game')!;
    expect(game.count).toBe(2);
    expect(game.leaves.find((l) => l.leaf === 'Coin')?.count).toBe(2);
    expect(tree.flatMap((g) => g.leaves)).toHaveLength(CATEGORIES.length + 1);
  });
});

describe('user presets', () => {
  const fakeStorage = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    };
  };

  it('saves, replaces by id, removes and survives garbage', () => {
    const storage = fakeStorage();
    const store = createUserPresetStore(registry, storage);
    expect(store.list()).toEqual([]);
    store.save(preset('user/1', 'One', 'UI/Tap'));
    store.save(preset('user/2', 'Two', 'UI/Tap'));
    store.save(preset('user/1', 'One v2', 'UI/Tap'));
    expect(store.list().map((p) => p.name)).toEqual(['Two', 'One v2']);
    expect(store.remove('user/2').map((p) => p.id)).toEqual(['user/1']);

    storage.m.set(USER_PRESETS_KEY, 'not json');
    expect(store.list()).toEqual([]);
    storage.m.set(USER_PRESETS_KEY, JSON.stringify([{ bad: 1 }, preset('user/3', 'Ok', 'UI/Tap')]));
    expect(store.list().map((p) => p.id)).toEqual(['user/3']);
  });

  it('works without storage', () => {
    const store = createUserPresetStore(registry, null);
    expect(store.save(preset('user/1', 'One', 'UI/Tap'))).toHaveLength(1);
    expect(store.list()).toEqual([]);
  });
});

describe('parsePresetFile', () => {
  it('accepts one preset, an array or {presets} and assigns user ids', () => {
    const p = preset('factory/x', 'X', 'UI/Tap');
    for (const text of [presetToJson(p), presetToJson([p, p]), JSON.stringify({ presets: [p] })]) {
      const out = parsePresetFile(registry, text);
      expect(out.length).toBeGreaterThan(0);
      for (const q of out) {
        expect(q.id).toMatch(/^user\//);
        expect(q.name).toBe('X');
      }
    }
  });

  it('rejects non-presets', () => {
    expect(() => parsePresetFile(registry, '{"hello": 1}')).toThrow();
    expect(() => parsePresetFile(registry, '[]')).toThrow();
    expect(() => parsePresetFile(registry, 'nope')).toThrow();
  });
});
