import { bus, type Patch, type Preset } from '../core';
import { registry } from '../modules';
import { actions, assets, engine, patch } from '../state/store';
import { splitCategory, type Category } from './categories';
import { makePreset } from './library';
import { generatePatch } from './recipes';

export const PREVIEW_NOTE = 60;

function play() {
  bus.emit('noteOn', { note: PREVIEW_NOTE, velocity: 0.9, source: 'ui' });
}

/**
 * Play the patch just loaded once its samples and effect worklets are ready. The engine prepares
 * new patches without waiting, and worklet effects pass audio through dry until loaded, so playing
 * straight away would make a preset's first hit miss its bitcrusher or granulizer (or a sample).
 */
export async function playWhenReady(p: Patch): Promise<void> {
  const ctx = engine.context;
  if (ctx) {
    await Promise.all([
      ...p.layers.map((l) => registry.sources.get(l.source)?.prepare?.(l.params, ctx, assets)),
      ...p.fx.map((f) => registry.effects.get(f.type)?.prepare?.(ctx)),
    ]).catch(() => {});
    // Let effect slots waiting on the same worklet swap their processor in first.
    await new Promise((r) => setTimeout(r, 0));
  }
  play();
}

/** Load a preset into the editor and play it. */
export function loadAndPlay(preset: Preset): void {
  actions.loadPreset(preset);
  void playWhenReady(patch.value);
}

/** Generate an on-target sound for a category ("smart randomise") and load it as a new, unsaved preset. */
export function generate(category: Category): void {
  const p = generatePatch(registry, category);
  loadAndPlay(
    makePreset({ id: 'generated', name: `New ${splitCategory(category)[1]}`, category, tags: [], patch: p }),
  );
}

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const presetSlug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'preset';
