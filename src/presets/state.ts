import { computed, signal } from '@preact/signals';
import { sanitizePatch, type Preset } from '../core';
import { registry } from '../modules';
import { currentPreset, patch } from '../state/store';
import { factoryPresets } from './factory';
import { createUserPresetStore, filterPresets, samePatch, sortPresets } from './library';
import type { Category } from './categories';

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const userStore = createUserPresetStore(registry, browserStorage());
export const userPresets = signal<Preset[]>(userStore.list());

export const query = signal('');
/** Category or group filter, or 'User' for saved presets. Null = all. */
export const categoryFilter = signal<string | null>(null);
export const tagFilter = signal<string[]>([]);
/** Category picked for "Generate"; tracks the browsed category when it is a full category. */
export const generateCategory = signal<Category>('Game/Coin');
export const hoverAudition = signal(false);

export const allPresets = computed(() => [...factoryPresets, ...sortPresets(userPresets.value)]);

export const isUserPreset = (p: Preset) => p.id.startsWith('user/');

export const visiblePresets = computed(() => {
  const cat = categoryFilter.value;
  const base = cat === 'User' ? userPresets.value : allPresets.value;
  return filterPresets(cat === 'User' ? sortPresets(base) : base, {
    query: query.value,
    category: cat === 'User' ? null : cat,
    tags: tagFilter.value,
  });
});

/** The loaded preset's patch exactly as actions.loadPreset puts it in the store, to detect edits. */
const loadedPatch = computed(() => {
  const p = currentPreset.value;
  return p ? sanitizePatch(registry, p.patch) : null;
});
export const isModified = computed(() => {
  const base = loadedPatch.value;
  return base !== null && !samePatch(base, patch.value);
});

export function saveUserPresets(list: Preset[]): void {
  userPresets.value = list;
}
