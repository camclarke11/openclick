import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Preset } from '../core';
import { registry } from '../modules';
import { assets } from '../state/store';
import { exportSettings, saveSettings } from './ExportButton';
import { download, isRobloxReady, robloxExportSettings } from './exportSound';
import { exportPack } from './pack';
import './export.css';

export interface PackChoice {
  /** Short label for the choice, e.g. "Everything". */
  label: string;
  /** Zip and folder name, e.g. "Sounds pack". */
  name: string;
  presets: readonly Preset[];
}

function formatLine(): string {
  const s = exportSettings.value;
  const depth = s.bitDepth === '32f' ? '32-bit float' : `${s.bitDepth}-bit`;
  return `${depth} · ${s.sampleRate / 1000} kHz · ${s.channels === 'mono' ? 'Mono' : 'Stereo'}`;
}

/**
 * "Download pack": renders a whole set of presets to WAVs in the browser and downloads them as
 * one zip, in folders by category, using the export settings.
 */
export function PackButton(props: { choices: PackChoice[]; notify?: (message: string) => void }) {
  const open = useSignal(false);
  const pick = useSignal(0);
  const busy = useSignal<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open.value) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) open.value = false;
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (open.value = false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open.value]);

  const choice = props.choices[Math.min(pick.value, props.choices.length - 1)]!;
  const count = choice.presets.length;

  const run = async () => {
    if (busy.value || count === 0) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    busy.value = `Rendering 0/${count}…`;
    try {
      const result = await exportPack(
        choice.presets,
        choice.name,
        exportSettings.value,
        { registry, assets },
        (done, total) => (busy.value = `Rendering ${done}/${total}…`),
        ctrl.signal,
      );
      download(result);
      props.notify?.(`Downloaded ${result.fileName} (${result.count} sounds)`);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        props.notify?.(`Pack download failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      busy.value = null;
      abort.current = null;
    }
  };

  const roblox = isRobloxReady(exportSettings.value);
  return (
    <div class="popover-anchor oc-pack" ref={ref}>
      <button
        type="button"
        class="btn"
        aria-expanded={open.value}
        title="Download a whole set of sounds as WAVs in one zip"
        onClick={() => (open.value = !open.value)}
      >
        {busy.value ? 'Downloading…' : 'Download pack'}
      </button>
      {open.value && (
        <div class="popover oc-pack-options" role="group" aria-label="Download pack">
          <span class="eyebrow">Download a sound pack</span>
          <div class="seg fill" role="radiogroup" aria-label="Sounds to include">
            {props.choices.map((c, i) => (
              <button
                key={c.label}
                type="button"
                role="radio"
                aria-checked={c === choice}
                class={c === choice ? 'on' : ''}
                disabled={!!busy.value}
                onClick={() => (pick.value = i)}
              >
                {c.label} <span class="chip-count">{c.presets.length}</span>
              </button>
            ))}
          </div>
          <div class="oc-pack-format">
            <span class="mono">{formatLine()}</span>
            <button
              type="button"
              class="oc-export-target"
              aria-pressed={roblox}
              disabled={!!busy.value}
              title="16-bit, 48 kHz, mono, normalised: ready to upload to Roblox"
              onClick={() => saveSettings({ ...exportSettings.value, ...robloxExportSettings })}
            >
              {roblox ? 'Roblox ready ✓' : 'Use Roblox settings'}
            </button>
          </div>
          <p class="oc-pack-note">
            One WAV per preset, in folders by category. Format follows Export options.
          </p>
          <div class="popover-actions">
            {busy.value && (
              <button type="button" class="btn" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            )}
            <button
              type="button"
              class="btn accent"
              disabled={!!busy.value || count === 0}
              onClick={() => void run()}
            >
              {busy.value ?? `Download ${count} WAV${count === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
