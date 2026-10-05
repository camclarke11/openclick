import {
  createRng,
  layerMixSchema,
  randomizeParams,
  renderPatch,
  type Patch,
  type Registry,
  type RenderOptions,
} from '../core';
import { normalize, toMono } from './process';
import { encodeWav, type BitDepth } from './wav';
import { createZip, type ZipEntry } from './zip';

export interface ExportSettings {
  bitDepth: BitDepth;
  sampleRate: 44100 | 48000;
  channels: 'stereo' | 'mono';
  /** Peak-normalise to -1 dBFS. */
  normalize: boolean;
  /** Number of files. Each variation renders with its own seed (round robins, noise, random lanes). */
  variations: number;
  /** 0..1: how far each variation's params drift from the patch (0 = only the seed changes). */
  mutate: number;
  /** MIDI note to render. */
  note: number;
}

export const defaultExportSettings: ExportSettings = {
  bitDepth: 16,
  sampleRate: 48000,
  channels: 'stereo',
  normalize: true,
  variations: 1,
  mutate: 0,
  note: 60,
};

export const MAX_VARIATIONS = 32;

/** Everything renderPatch needs besides the per-file settings. */
export type RenderEnv = Pick<RenderOptions, 'registry' | 'assets' | 'createContext' | 'maxSeconds'>;

/** "Retro Coin 2!" -> "retro-coin-2". Never empty. */
export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'openclick-sound';
}

/** Small random drift of every randomisable param, for "export variations". */
export function mutatePatch(registry: Registry, patch: Patch, seed: number, amount: number): Patch {
  if (amount <= 0) return patch;
  const rng = createRng(seed);
  return {
    ...patch,
    layers: patch.layers.map((l) => {
      const mod = registry.sources.get(l.source);
      return {
        ...l,
        params: mod ? randomizeParams(mod.schema, l.params, rng, amount) : l.params,
        mix: randomizeParams(layerMixSchema, l.mix, rng, amount),
      };
    }),
    fx: patch.fx.map((f) => {
      const mod = registry.effects.get(f.type);
      return mod ? { ...f, params: randomizeParams(mod.schema, f.params, rng, amount) } : f;
    }),
  };
}

/** Render one WAV file. */
export async function renderWav(
  patch: Patch,
  settings: ExportSettings,
  env: RenderEnv,
  seed = 1,
): Promise<Uint8Array> {
  let audio = await renderPatch(patch, {
    ...env,
    sampleRate: settings.sampleRate,
    seed,
    note: settings.note,
  });
  if (settings.channels === 'mono') audio = toMono(audio);
  if (settings.normalize) audio = normalize(audio);
  return encodeWav(audio, { bitDepth: settings.bitDepth });
}

export interface ExportResult {
  fileName: string;
  data: Uint8Array;
  mime: string;
}

/**
 * Render the patch as a WAV, or as a zip of numbered WAVs when `variations` > 1. The first
 * variation is always the unmodified patch with seed 1, so it matches the single-file export.
 */
export async function exportSound(
  patch: Patch,
  name: string,
  settings: ExportSettings,
  env: RenderEnv,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const base = slugify(name);
  const count = Math.max(1, Math.min(MAX_VARIATIONS, Math.round(settings.variations)));
  if (count === 1) {
    const data = await renderWav(patch, settings, env, 1);
    onProgress?.(1, 1);
    return { fileName: `${base}.wav`, data, mime: 'audio/wav' };
  }
  const files: ZipEntry[] = [];
  const pad = String(count).length;
  for (let i = 0; i < count; i++) {
    const seed = i + 1;
    const p = i === 0 ? patch : mutatePatch(env.registry, patch, seed * 7919, settings.mutate);
    files.push({
      name: `${base}-${String(i + 1).padStart(pad, '0')}.wav`,
      data: await renderWav(p, settings, env, seed),
    });
    onProgress?.(i + 1, count);
  }
  return { fileName: `${base}-x${count}.zip`, data: createZip(files), mime: 'application/zip' };
}

/** Trigger a browser download. */
export function download(result: ExportResult): void {
  const blob = new Blob([result.data as BlobPart], { type: result.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
