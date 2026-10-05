import { parsePreset, PRESET_FORMAT, PRESET_VERSION, type Patch, type Preset, type Registry } from '../core';
import { CATEGORIES } from './categories';

const categoryRank = (c: string) => {
  const i = (CATEGORIES as readonly string[]).indexOf(c);
  return i < 0 ? CATEGORIES.length : i;
};

/** Stable browse order: category order from the plan, then name. */
export function sortPresets(presets: Preset[]): Preset[] {
  return [...presets].sort(
    (a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name),
  );
}

/**
 * Parse a map of file path -> JSON (as `import.meta.glob` gives) into presets for this registry.
 * Bad files are reported and skipped so one broken preset can't take down the app.
 */
export function loadPresetFiles(
  registry: Registry,
  files: Record<string, unknown>,
  onError: (path: string, err: unknown) => void = (path, err) => console.warn(`Skipping preset ${path}`, err),
): Preset[] {
  const out: Preset[] = [];
  for (const [path, json] of Object.entries(files)) {
    try {
      const preset = parsePreset(registry, json);
      if (!preset.id) preset.id = `factory/${path.replace(/^.*\//, '').replace(/\.json$/, '')}`;
      out.push(preset);
    } catch (err) {
      onError(path, err);
    }
  }
  return sortPresets(out);
}

export interface PresetFilter {
  query?: string;
  /** Exact category ('Game/Coin') or a group ('Game'). */
  category?: string | null;
  /** Presets must carry every listed tag. */
  tags?: readonly string[];
}

export function filterPresets(presets: readonly Preset[], f: PresetFilter): Preset[] {
  const words = (f.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const cat = f.category ?? null;
  const tags = f.tags ?? [];
  return presets.filter((p) => {
    if (cat && p.category !== cat && !p.category.startsWith(`${cat}/`)) return false;
    if (!tags.every((t) => p.tags.includes(t))) return false;
    const hay = `${p.name} ${p.category} ${p.tags.join(' ')} ${p.author ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Neighbour in a list for previous/next buttons, wrapping around. */
export function stepPreset(
  list: readonly Preset[],
  currentId: string | undefined,
  dir: 1 | -1,
): Preset | null {
  if (!list.length) return null;
  const i = list.findIndex((p) => p.id === currentId);
  if (i < 0) return dir === 1 ? list[0]! : list[list.length - 1]!;
  return list[(i + dir + list.length) % list.length]!;
}

/** Patch equality for "modified" marking. Patches are plain JSON. */
export const samePatch = (a: Patch, b: Patch): boolean => JSON.stringify(a) === JSON.stringify(b);

export function newPresetId(prefix = 'user'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}/${rand}`;
}

export function makePreset(fields: Omit<Preset, 'format' | 'version'>): Preset {
  return { format: PRESET_FORMAT, version: PRESET_VERSION, ...fields };
}

/** Pretty JSON for downloads and for files in presets/. */
export const presetToJson = (preset: Preset | Preset[]): string => `${JSON.stringify(preset, null, 2)}\n`;

/**
 * Parse an imported file: a single preset, an array of presets, or `{ presets: [...] }`.
 * Imported presets get fresh user ids so they never shadow factory presets.
 */
export function parsePresetFile(registry: Registry, text: string): Preset[] {
  const json: unknown = JSON.parse(text);
  const items = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { presets?: unknown }).presets)
      ? (json as { presets: unknown[] }).presets
      : [json];
  if (!items.length) throw new Error('No presets in file');
  return items.map((item) => ({ ...parsePreset(registry, item), id: newPresetId() }));
}

/** Minimal Storage surface, so tests can pass a Map-backed fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const USER_PRESETS_KEY = 'openclick.userPresets';

/** User presets persisted as one JSON array in localStorage. Every read is sanitised for the registry. */
export function createUserPresetStore(registry: Registry, storage: KeyValueStorage | null) {
  const read = (): Preset[] => {
    if (!storage) return [];
    try {
      const raw = storage.getItem(USER_PRESETS_KEY);
      const arr: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.flatMap((item) => {
        try {
          return [parsePreset(registry, item)];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  };
  const write = (presets: Preset[]) => {
    try {
      storage?.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
    } catch {
      // Quota or private mode: the preset still lives for this session.
    }
  };
  return {
    list: read,
    /** Insert, or replace the preset with the same id. Returns the new list. */
    save(preset: Preset): Preset[] {
      const list = read().filter((p) => p.id !== preset.id);
      list.push(preset);
      write(list);
      return list;
    },
    remove(id: string): Preset[] {
      const list = read().filter((p) => p.id !== id);
      write(list);
      return list;
    },
  };
}

export type UserPresetStore = ReturnType<typeof createUserPresetStore>;
