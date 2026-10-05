import { defaultParams, sanitizeParams, type Params, type ParamSchema } from './params';
import type { Registry } from './types';

export const MAX_LAYERS = 4;

/** Fixed per-layer mixer params that every layer has regardless of source type. */
export const layerMixSchema = {
  gain: { kind: 'number', label: 'Level', min: -60, max: 6, default: 0, unit: 'dB', randomize: false },
  pan: { kind: 'number', label: 'Pan', min: -1, max: 1, default: 0, randomRange: [-0.5, 0.5] },
  transpose: { kind: 'number', label: 'Transpose', min: -24, max: 24, default: 0, step: 1, unit: 'st' },
  delay: { kind: 'number', label: 'Offset', min: 0, max: 500, default: 0, unit: 'ms', randomRange: [0, 80] },
} satisfies ParamSchema;

export interface LayerSpec {
  enabled: boolean;
  /** SourceModule.type, e.g. 'beep' or 'click'. */
  source: string;
  /** Values for layerMixSchema. */
  mix: Params;
  /** Values for the source's own schema. */
  params: Params;
}

export interface FxSlot {
  /** EffectModule.type */
  type: string;
  enabled: boolean;
  params: Params;
}

/** Everything needed to reproduce a sound. Pure data, JSON-serialisable. */
export interface Patch {
  layers: LayerSpec[];
  /** Values for the arpeggiator schema. */
  arp: Params;
  /** Serial chain, in order. Shared by all layers. */
  fx: FxSlot[];
  master: { gain: number };
}

export const PRESET_FORMAT = 'openclick-preset';
export const PRESET_VERSION = 1;

export interface Preset {
  format: typeof PRESET_FORMAT;
  version: number;
  id: string;
  name: string;
  /** e.g. 'UI/Click', 'UI/Notification', 'Game/Coin', 'Game/Laser'. See docs/PLAN.md. */
  category: string;
  tags: string[];
  author?: string;
  patch: Patch;
}

export function defaultLayer(registry: Registry, source: string): LayerSpec {
  const mod = registry.sources.get(source);
  if (!mod) throw new Error(`Unknown source "${source}"`);
  return { enabled: true, source, mix: defaultParams(layerMixSchema), params: defaultParams(mod.schema) };
}

export function defaultFxSlot(registry: Registry, type: string): FxSlot {
  const mod = registry.effects.get(type);
  if (!mod) throw new Error(`Unknown effect "${type}"`);
  return { type, enabled: true, params: defaultParams(mod.schema) };
}

export function defaultPatch(registry: Registry, source = 'beep'): Patch {
  return {
    layers: [defaultLayer(registry, source)],
    arp: defaultParams(registry.arp.schema),
    fx: [],
    master: { gain: 0 },
  };
}

/**
 * Make any parsed JSON into a valid Patch for the current registry: unknown sources/effects are
 * dropped, params are clamped and filled with defaults. Use on every preset load and import.
 */
export function sanitizePatch(registry: Registry, input: unknown): Patch {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<Patch>;
  const layers = (Array.isArray(src.layers) ? src.layers : [])
    .filter((l): l is LayerSpec => !!l && registry.sources.has((l as LayerSpec).source))
    .slice(0, MAX_LAYERS)
    .map((l) => ({
      enabled: typeof l.enabled === 'boolean' ? l.enabled : true,
      source: l.source,
      mix: sanitizeParams(layerMixSchema, l.mix),
      params: sanitizeParams(registry.sources.get(l.source)!.schema, l.params),
    }));
  const fx = (Array.isArray(src.fx) ? src.fx : [])
    .filter((f): f is FxSlot => !!f && registry.effects.has((f as FxSlot).type))
    .map((f) => ({
      type: f.type,
      enabled: typeof f.enabled === 'boolean' ? f.enabled : true,
      params: sanitizeParams(registry.effects.get(f.type)!.schema, f.params),
    }));
  const gain = src.master && typeof src.master.gain === 'number' ? src.master.gain : 0;
  return {
    layers: layers.length ? layers : defaultPatch(registry).layers,
    arp: sanitizeParams(registry.arp.schema, src.arp),
    fx,
    master: { gain: Math.min(6, Math.max(-60, gain)) },
  };
}

export function parsePreset(registry: Registry, json: unknown): Preset {
  const p = (json && typeof json === 'object' ? json : {}) as Partial<Preset>;
  if (p.format !== PRESET_FORMAT) throw new Error('Not an OpenClick preset');
  if (typeof p.version !== 'number' || p.version > PRESET_VERSION) {
    throw new Error(`Unsupported preset version ${String(p.version)}`);
  }
  return {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    id: String(p.id ?? ''),
    name: String(p.name ?? 'Untitled'),
    category: String(p.category ?? 'Uncategorised'),
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
    ...(p.author ? { author: String(p.author) } : {}),
    patch: sanitizePatch(registry, p.patch),
  };
}

export const dbToGain = (db: number): number => (db <= -60 ? 0 : Math.pow(10, db / 20));
export const midiToHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);
