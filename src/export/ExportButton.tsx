import { signal, useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { registry } from '../modules';
import { assets, currentPreset, patch } from '../state/store';
import {
  defaultExportSettings,
  download,
  exportSound,
  isRobloxReady,
  MAX_VARIATIONS,
  robloxExportSettings,
  type ExportSettings,
} from './exportSound';
import type { BitDepth } from './wav';
import './export.css';

const STORAGE_KEY = 'openclick.exportSettings';

function loadSettings(): ExportSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultExportSettings, ...(JSON.parse(raw) as Partial<ExportSettings>) };
  } catch {
    // Private mode or bad JSON: defaults are fine.
  }
  return defaultExportSettings;
}

/** Shared by the export button and the pack download, so both write files the same way. */
export const exportSettings = signal<ExportSettings>(loadSettings());

export function saveSettings(s: ExportSettings): void {
  exportSettings.value = s;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not fatal.
  }
}

const FORMATS: [BitDepth, string][] = [
  [16, '16-bit'],
  [24, '24-bit'],
  ['32f', '32-bit float'],
];
const RATES: [44100 | 48000, string][] = [
  [44100, '44.1 kHz'],
  [48000, '48 kHz'],
];
const CHANNELS: ['stereo' | 'mono', string][] = [
  ['stereo', 'Stereo'],
  ['mono', 'Mono'],
];

function Seg<T>(props: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="export-field">
      <span class="export-field-label">{props.label}</span>
      <div class="seg fill" role="radiogroup" aria-label={props.label}>
        {props.options.map(([v, text]) => (
          <button
            key={text}
            type="button"
            role="radio"
            aria-checked={v === props.value}
            class={v === props.value ? 'on' : ''}
            onClick={() => props.onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Split button: renders the current patch offline and downloads a WAV (or a zip of variations);
 * the arrow opens the export options.
 */
export function ExportButton(props: { notify?: (message: string) => void }) {
  const settings = exportSettings;
  const open = useSignal(false);
  const busy = useSignal<string | null>(null);
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

  const set = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    settings.value = { ...settings.value, [key]: value };
    saveSettings(settings.value);
  };

  const run = async () => {
    if (busy.value) return;
    busy.value = 'Rendering…';
    try {
      const s = settings.value;
      const result = await exportSound(
        patch.value,
        currentPreset.value?.name ?? 'openclick-sound',
        s,
        { registry, assets },
        (done, total) => {
          if (total > 1) busy.value = `Rendering ${done}/${total}…`;
        },
      );
      download(result);
      props.notify?.(`Exported ${result.fileName}`);
    } catch (e) {
      props.notify?.(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy.value = null;
    }
  };

  const s = settings.value;
  const varyPct = Math.round(s.mutate * 100);
  return (
    <div class="oc-export" ref={ref}>
      <button type="button" class="oc-export-go" onClick={run} disabled={!!busy.value}>
        {busy.value ?? (s.variations > 1 ? `Export ${s.variations} WAVs` : 'Export WAV')}
      </button>
      <button
        type="button"
        class="oc-export-toggle"
        aria-expanded={open.value}
        aria-label="Export options"
        title="Export options"
        onClick={() => (open.value = !open.value)}
      >
        ▼
      </button>
      {open.value && (
        <div class="popover oc-export-options" role="group" aria-label="Export options">
          <span class="eyebrow">Export options</span>
          <button
            type="button"
            class="oc-export-target"
            aria-pressed={isRobloxReady(s)}
            title="16-bit, 48 kHz, mono, normalised: ready to upload to Roblox"
            onClick={() => {
              settings.value = { ...settings.value, ...robloxExportSettings };
              saveSettings(settings.value);
            }}
          >
            {isRobloxReady(s) ? 'Roblox ready ✓' : 'Use Roblox settings'}
          </button>
          <Seg label="Format" options={FORMATS} value={s.bitDepth} onChange={(v) => set('bitDepth', v)} />
          <Seg
            label="Sample rate"
            options={RATES}
            value={s.sampleRate}
            onChange={(v) => set('sampleRate', v)}
          />
          <Seg label="Channels" options={CHANNELS} value={s.channels} onChange={(v) => set('channels', v)} />
          <button
            type="button"
            role="switch"
            aria-checked={s.normalize}
            class={`switch${s.normalize ? ' on' : ''}`}
            onClick={() => set('normalize', !s.normalize)}
          >
            <span class="switch-track" aria-hidden="true">
              <span class="switch-knob" />
            </span>
            <span class="switch-text">Normalise to −1 dB</span>
          </button>
          <div class="export-variations">
            <span class="export-field-label">Variations</span>
            <div class="stepper">
              <button
                type="button"
                class="btn icon"
                aria-label="Fewer variations"
                disabled={s.variations <= 1}
                onClick={() => set('variations', Math.max(1, s.variations - 1))}
              >
                −
              </button>
              <span class="mono" aria-live="polite">
                {s.variations}
              </span>
              <button
                type="button"
                class="btn icon"
                aria-label="More variations"
                disabled={s.variations >= MAX_VARIATIONS}
                onClick={() => set('variations', Math.min(MAX_VARIATIONS, s.variations + 1))}
              >
                +
              </button>
            </div>
          </div>
          {s.variations > 1 && (
            <label class="export-vary">
              <span class="export-field-label">Vary by</span>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={s.mutate}
                onInput={(e) => set('mutate', Number(e.currentTarget.value))}
              />
              <span class="mono">{varyPct}%</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
