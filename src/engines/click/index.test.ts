import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createMemoryAssetStore,
  createRegistry,
  createRng,
  defaultParams,
  defaultPatch,
  peak,
  randomizeParams,
  sanitizeParams,
  SoundGraph,
  type AssetStore,
  type Params,
  type RenderedAudio,
} from '../../core';
import { registry } from '../../modules';
import { createTestContext, renderForTest } from '../../test/audio';
import { clickSchema, clickSource } from './index';
import { findSound, library, manifest } from './library';

const SR = 48000;
const sound = findSound(clickSchema.sound.default)!;

/** Takes filled with constant levels 0.1, 0.2, ... so the output tells us which one played. */
function constantTakes(seconds = 0.1): AssetStore {
  const ctx = createTestContext(1, 1, SR);
  const store = createMemoryAssetStore();
  sound.files.forEach((file, i) => {
    const buf = ctx.createBuffer(1, Math.round(seconds * SR), SR);
    buf.getChannelData(0).fill((i + 1) * 0.1);
    store.set(file, buf);
  });
  return store;
}

function patchWith(params: Params) {
  const p = defaultPatch(registry, 'click');
  p.layers[0]!.params = sanitizeParams(clickSchema, { ...p.layers[0]!.params, ...params });
  return p;
}

function render(params: Params, opts: { assets?: AssetStore; note?: number } = {}) {
  return renderForTest(registry, patchWith(params), { assets: opts.assets ?? constantTakes(), ...opts });
}

const seconds = (a: RenderedAudio) => a.channels[0]!.length / a.sampleRate;

/** Play several notes 0.2 s apart through one graph and report the level of each hit. */
async function hitLevels(params: Params, hits: number, seed = 1): Promise<number[]> {
  const ctx = createTestContext(2, Math.round(hits * 0.2 * SR), SR);
  const graph = new SoundGraph(ctx, ctx.destination, {
    registry,
    assets: constantTakes(),
    rng: createRng(seed),
  });
  graph.setPatch(patchWith(params));
  for (let i = 0; i < hits; i++) graph.trigger(60, 1, i * 0.2);
  const out = (await ctx.startRendering()).getChannelData(0);
  // The layer panner scales mono by cos(pi/4); undo it to read the take's level.
  return Array.from({ length: hits }, (_, i) =>
    Math.round((out[Math.round((i * 0.2 + 0.05) * SR)]! / Math.SQRT1_2) * 10),
  );
}

describe('sample library', () => {
  it('lists every category and file, all present on disk and labelled placeholder', () => {
    expect(manifest.categories.map((c) => c.name)).toEqual([
      'Switches',
      'Keyboards',
      'Cameras',
      'Toys',
      'Control panels',
    ]);
    for (const s of library) {
      expect(s.placeholder).toBe(true);
      expect(s.files.length).toBeGreaterThan(1);
      for (const f of s.files)
        expect(existsSync(new URL(`../../../public/samples/${f}`, import.meta.url))).toBe(true);
    }
    expect(new Set(library.map((s) => s.key)).size).toBe(library.length);
    expect(clickSchema.sound.options).toEqual(library.map((s) => s.key));
  });
});

describe('clickSource', () => {
  it('plays a loaded sample', async () => {
    const audio = await render({});
    expect(peak(audio)).toBeCloseTo(0.1 * Math.SQRT1_2, 3);
    expect(seconds(audio)).toBeCloseTo(0.1, 1);
  });

  it('is silent and does not throw when samples are not loaded or the sound is unknown', async () => {
    expect(peak(await render({}, { assets: createMemoryAssetStore() }))).toBe(0);
    const ctx = createTestContext(1, SR, SR);
    const voice = clickSource.createVoice(
      { ctx, output: ctx.destination, rng: createRng(1), assets: constantTakes() },
      { ...defaultParams(clickSchema), sound: 'Nope/Missing' },
      { note: 60, velocity: 1, time: 0, gate: 0.25, pan: 0 },
    );
    expect(voice.endTime).toBe(0);
  });

  it('pitch changes playback length', async () => {
    const up = await render({ pitch: 12 });
    const down = await render({ pitch: -12 });
    expect(seconds(up)).toBeCloseTo(0.05, 2);
    expect(seconds(down)).toBeCloseTo(0.2, 2);
    // Key follow: an octave up from middle C also halves it; without key follow it doesn't.
    expect(seconds(await render({}, { note: 72 }))).toBeCloseTo(0.05, 2);
    expect(seconds(await render({ keyFollow: false }, { note: 72 }))).toBeCloseTo(0.1, 2);
  });

  it('start offset, length and gate shorten the sound', async () => {
    expect(seconds(await render({ start: 50 }))).toBeCloseTo(0.05, 2);
    expect(seconds(await render({ length: 0.02 }))).toBeCloseTo(0.02, 2);
    expect(seconds(await render({ followGate: true }, { assets: constantTakes(1) }))).toBeCloseTo(0.25, 2);
  });

  it('reverse plays the sample backwards', async () => {
    const ctx = createTestContext(1, 1, SR);
    const ramp = ctx.createBuffer(1, SR / 10, SR);
    ramp.getChannelData(0).forEach((_, i, d) => (d[i] = i / d.length));
    const assets = createMemoryAssetStore(Object.fromEntries(sound.files.map((f) => [f, ramp])));
    const fwd = (await render({ fade: 0.001 }, { assets })).channels[0]!;
    const rev = (await render({ fade: 0.001, reverse: true }, { assets })).channels[0]!;
    expect(fwd[100]!).toBeLessThan(fwd[3000]!);
    expect(rev[100]!).toBeGreaterThan(rev[3000]!);
  });

  it('cycles round robins in order', async () => {
    const n = sound.files.length;
    const levels = await hitLevels({ roundRobin: 'cycle' }, n + 1);
    expect(levels).toEqual([...Array.from({ length: n }, (_, i) => i + 1), 1]);
  });

  it('random round robin never repeats a take and is deterministic per seed', async () => {
    const a = await hitLevels({ roundRobin: 'random' }, 8, 3);
    expect(await hitLevels({ roundRobin: 'random' }, 8, 3)).toEqual(a);
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
    expect(new Set(a).size).toBeGreaterThan(1);
  });

  it('fixed round robin always plays the chosen take', async () => {
    expect(await hitLevels({ roundRobin: 'fixed', variation: 3 }, 3)).toEqual([3, 3, 3]);
  });

  it('velocity sensitivity scales level', async () => {
    const reg = createRegistry({ sources: [clickSource], effects: [], arp: registry.arp });
    const p = patchWith({ velocity: 100 });
    const soft = await renderForTest(reg, p, { assets: constantTakes(), velocity: 0.5 });
    expect(peak(soft)).toBeCloseTo(0.05 * Math.SQRT1_2, 3);
  });

  it('prepare loads only the selected sound', async () => {
    const loaded: string[] = [];
    const assets: AssetStore = { get: () => undefined, load: async (ids) => void loaded.push(...ids) };
    const ctx = createTestContext(1, 1, SR);
    await clickSource.prepare!({ ...defaultParams(clickSchema), sound: library[3]!.key }, ctx, assets);
    expect(loaded).toEqual(library[3]!.files);
  });

  it('prepare swallows load failures', async () => {
    const assets: AssetStore = { get: () => undefined, load: () => Promise.reject(new Error('404')) };
    const ctx = createTestContext(1, 1, SR);
    const warn = console.warn;
    console.warn = () => {};
    await expect(clickSource.prepare!(defaultParams(clickSchema), ctx, assets)).resolves.toBeUndefined();
    console.warn = warn;
  });

  it('randomises into valid params', () => {
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) {
      const p = randomizeParams(clickSchema, defaultParams(clickSchema), rng);
      expect(sanitizeParams(clickSchema, p)).toEqual(p);
      expect(findSound(p.sound as string)).toBeDefined();
    }
  });

  it('renders a real placeholder sample through the filter', async () => {
    const { readFileSync } = await import('node:fs');
    const ctx = createTestContext(1, 1, SR);
    const store = createMemoryAssetStore();
    for (const f of sound.files) {
      const bytes = readFileSync(new URL(`../../../public/samples/${f}`, import.meta.url));
      store.set(
        f,
        await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)),
      );
    }
    const dry = await render({}, { assets: store });
    const filtered = await render({ filter: 'lowpass', cutoff: 200 }, { assets: store });
    expect(peak(dry)).toBeGreaterThan(0.3);
    expect(peak(dry)).toBeLessThanOrEqual(1);
    expect(peak(filtered)).toBeLessThan(peak(dry) / 2);
  });
});
