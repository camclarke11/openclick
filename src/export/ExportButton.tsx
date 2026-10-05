import { useSignal } from '@preact/signals';
import { registry } from '../modules';
import { assets, currentPreset, patch } from '../state/store';
import {
  defaultExportSettings,
  download,
  exportSound,
  MAX_VARIATIONS,
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

function saveSettings(s: ExportSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not fatal.
  }
}

/** Renders the current patch offline and downloads it as WAV (or a zip of variations). */
export function ExportButton() {
  const settings = useSignal<ExportSettings>(loadSettings());
  const open = useSignal(false);
  const busy = useSignal<string | null>(null);
  const error = useSignal<string | null>(null);

  const set = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    settings.value = { ...settings.value, [key]: value };
    saveSettings(settings.value);
  };

  const run = async () => {
    if (busy.value) return;
    error.value = null;
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
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = null;
    }
  };

  const s = settings.value;
  return (
    <div class="oc-export">
      <div class="oc-export-row">
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
          ⚙
        </button>
      </div>
      {error.value && (
        <p class="oc-export-error" role="alert">
          Export failed: {error.value}
        </p>
      )}
      {open.value && (
        <div class="oc-export-options" role="group" aria-label="Export options">
          <label>
            Format
            <select
              value={String(s.bitDepth)}
              onChange={(e) => {
                const v = e.currentTarget.value;
                set('bitDepth', (v === '32f' ? v : Number(v)) as BitDepth);
              }}
            >
              <option value="16">16-bit</option>
              <option value="24">24-bit</option>
              <option value="32f">32-bit float</option>
            </select>
          </label>
          <label>
            Sample rate
            <select
              value={String(s.sampleRate)}
              onChange={(e) => set('sampleRate', Number(e.currentTarget.value) as 44100 | 48000)}
            >
              <option value="44100">44.1 kHz</option>
              <option value="48000">48 kHz</option>
            </select>
          </label>
          <label>
            Channels
            <select
              value={s.channels}
              onChange={(e) => set('channels', e.currentTarget.value as 'stereo' | 'mono')}
            >
              <option value="stereo">Stereo</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label class="oc-export-check">
            <input
              type="checkbox"
              checked={s.normalize}
              onChange={(e) => set('normalize', e.currentTarget.checked)}
            />
            Normalise to −1 dB
          </label>
          <label>
            Variations
            <input
              type="number"
              min={1}
              max={MAX_VARIATIONS}
              value={s.variations}
              onChange={(e) =>
                set('variations', Math.max(1, Math.min(MAX_VARIATIONS, Number(e.currentTarget.value) || 1)))
              }
            />
          </label>
          {s.variations > 1 && (
            <label>
              Vary by {Math.round(s.mutate * 100)}%
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={s.mutate}
                onInput={(e) => set('mutate', Number(e.currentTarget.value))}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
