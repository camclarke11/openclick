import { computed, signal } from '@preact/signals';
import {
  bus,
  createAssetStore,
  createRng,
  defaultFxSlot,
  defaultLayer,
  defaultPatch,
  Engine,
  MAX_LAYERS,
  randomizeParams,
  sanitizePatch,
  layerMixSchema,
  type Params,
  type ParamValue,
  type Patch,
  type Preset,
} from '../core';
import { registry } from '../modules';

/**
 * App state. The patch is a single immutable value in a signal: every action produces a new
 * Patch, and the engine follows it. UI, presets and export all read and write through here.
 */
export const assets = createAssetStore((id) => `${import.meta.env.BASE_URL}samples/${id}`);
export const engine = new Engine(registry, assets);
engine.connect(bus);

export const patch = signal<Patch>(defaultPatch(registry));
/** Preset the current patch came from, if any (cleared on edit is up to the UI). */
export const currentPreset = signal<Preset | null>(null);
export const layerCount = computed(() => patch.value.layers.length);

patch.subscribe((p) => engine.setPatch(p));

const rng = createRng();

function update(fn: (p: Patch) => Patch): void {
  patch.value = fn(patch.value);
}

function replaceAt<T>(items: T[], i: number, fn: (item: T) => T): T[] {
  return items.map((item, j) => (j === i ? fn(item) : item));
}

export const actions = {
  setPatch(p: Patch) {
    patch.value = sanitizePatch(registry, p);
  },
  loadPreset(preset: Preset) {
    currentPreset.value = preset;
    patch.value = sanitizePatch(registry, preset.patch);
  },

  // Layers
  addLayer(source = 'beep') {
    update((p) =>
      p.layers.length >= MAX_LAYERS ? p : { ...p, layers: [...p.layers, defaultLayer(registry, source)] },
    );
  },
  removeLayer(i: number) {
    update((p) => (p.layers.length <= 1 ? p : { ...p, layers: p.layers.filter((_, j) => j !== i) }));
  },
  setLayerSource(i: number, source: string) {
    update((p) => ({
      ...p,
      layers: replaceAt(p.layers, i, (l) => ({ ...defaultLayer(registry, source), mix: l.mix })),
    }));
  },
  setLayerEnabled(i: number, enabled: boolean) {
    update((p) => ({ ...p, layers: replaceAt(p.layers, i, (l) => ({ ...l, enabled })) }));
  },
  setLayerParam(i: number, key: string, value: ParamValue) {
    update((p) => ({
      ...p,
      layers: replaceAt(p.layers, i, (l) => ({ ...l, params: { ...l.params, [key]: value } })),
    }));
  },
  setLayerMix(i: number, key: string, value: ParamValue) {
    update((p) => ({
      ...p,
      layers: replaceAt(p.layers, i, (l) => ({ ...l, mix: { ...l.mix, [key]: value } })),
    }));
  },

  // Arpeggiator
  setArpParam(key: string, value: ParamValue) {
    update((p) => ({ ...p, arp: { ...p.arp, [key]: value } }));
  },

  // Effects
  addFx(type: string) {
    update((p) => ({ ...p, fx: [...p.fx, defaultFxSlot(registry, type)] }));
  },
  removeFx(i: number) {
    update((p) => ({ ...p, fx: p.fx.filter((_, j) => j !== i) }));
  },
  moveFx(from: number, to: number) {
    update((p) => {
      const fx = [...p.fx];
      const [slot] = fx.splice(from, 1);
      if (slot) fx.splice(to, 0, slot);
      return { ...p, fx };
    });
  },
  setFxEnabled(i: number, enabled: boolean) {
    update((p) => ({ ...p, fx: replaceAt(p.fx, i, (f) => ({ ...f, enabled })) }));
  },
  setFxParam(i: number, key: string, value: ParamValue) {
    update((p) => ({
      ...p,
      fx: replaceAt(p.fx, i, (f) => ({ ...f, params: { ...f.params, [key]: value } })),
    }));
  },

  setMasterGain(gain: number) {
    update((p) => ({ ...p, master: { gain } }));
  },

  // Randomise (generic, schema-driven; the Presets workstream may layer smarter generators on top)
  randomizeLayer(i: number, amount = 1) {
    update((p) => ({
      ...p,
      layers: replaceAt(p.layers, i, (l) => ({
        ...l,
        params: randomizeParams(registry.sources.get(l.source)!.schema, l.params, rng, amount),
        mix: randomizeParams(layerMixSchema, l.mix, rng, amount),
      })),
    }));
  },
  randomizeArp(amount = 1) {
    update((p) => ({ ...p, arp: randomizeParams(registry.arp.schema, p.arp, rng, amount) }));
  },
  randomizeFx(i: number, amount = 1) {
    update((p) => ({
      ...p,
      fx: replaceAt(p.fx, i, (f) => ({
        ...f,
        params: randomizeParams(registry.effects.get(f.type)!.schema, f.params, rng, amount),
      })),
    }));
  },
  randomizeAll(amount = 1) {
    patch.value.layers.forEach((_, i) => actions.randomizeLayer(i, amount));
    patch.value.fx.forEach((_, i) => actions.randomizeFx(i, amount));
    actions.randomizeArp(amount);
  },
};

export type Actions = typeof actions;
export type { Params };
