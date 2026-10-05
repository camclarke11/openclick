import type { Preset } from '../core';
import { renderWav, slugify, type ExportSettings, type RenderEnv } from './exportSound';
import { createZip, type ZipEntry } from './zip';

/** "Game/Power-up" -> "Game/Power-up"; anything odd in a segment becomes a dash. Never empty. */
function folderFor(category: string): string {
  const parts = category
    .split('/')
    .map((s) => s.replace(/[^A-Za-z0-9 _-]+/g, '-').trim())
    .filter(Boolean);
  return parts.length ? parts.join('/') : 'Other';
}

/** Zip paths for each preset: `<root>/<Group>/<Category>/<name>.wav`, made unique within a folder. */
export function packPaths(presets: readonly Preset[], root: string): string[] {
  const used = new Set<string>();
  return presets.map((p) => {
    const dir = `${root}/${folderFor(p.category)}`;
    const base = slugify(p.name);
    let path = `${dir}/${base}.wav`;
    for (let i = 2; used.has(path); i++) path = `${dir}/${base}-${i}.wav`;
    used.add(path);
    return path;
  });
}

function describe(s: ExportSettings): string {
  const depth = s.bitDepth === '32f' ? '32-bit float' : `${s.bitDepth}-bit`;
  return `${depth}, ${s.sampleRate / 1000} kHz, ${s.channels}${s.normalize ? ', normalised to -1 dBFS' : ''}`;
}

function readme(title: string, count: number, s: ExportSettings): string {
  return [
    title,
    '',
    `${count} sounds rendered from the Sounds factory presets (https://sounds.camlc.dev),`,
    `as WAV files (${describe(s)}), in folders by category.`,
    '',
    'License: free to use in any project, commercial or not, with no attribution required.',
    'The recorded samples behind these sounds are CC0 (public domain), from Kenney (kenney.nl)',
    'and Juhani Junkala; everything else is synthesised by Sounds.',
    '',
    'Open any preset at sounds.camlc.dev to tweak it and export your own version.',
    '',
  ].join('\n');
}

export interface PackResult {
  fileName: string;
  data: Uint8Array;
  mime: string;
  count: number;
}

/**
 * Render every preset (seed 1, the same file the single export gives) into one zip, in folders
 * by category, with a README. Yields to the event loop between renders so the UI stays live.
 */
export async function exportPack(
  presets: readonly Preset[],
  name: string,
  settings: ExportSettings,
  env: RenderEnv,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PackResult> {
  const root = slugify(name);
  const paths = packPaths(presets, root);
  const single = { ...settings, variations: 1, mutate: 0 };
  const files: ZipEntry[] = [
    { name: `${root}/README.txt`, data: new TextEncoder().encode(readme(name, presets.length, single)) },
  ];
  for (let i = 0; i < presets.length; i++) {
    signal?.throwIfAborted();
    const data = await renderWav(presets[i]!.patch, single, env, 1);
    signal?.throwIfAborted();
    files.push({ name: paths[i]!, data });
    onProgress?.(i + 1, presets.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return { fileName: `${root}.zip`, data: createZip(files), mime: 'application/zip', count: presets.length };
}
