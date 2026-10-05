import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { registry } from '../modules';
import { actions, currentPreset, patch } from '../state/store';
import { downloadText, generate, loadAndPlay, presetSlug, PREVIEW_NOTE } from './actions';
import { audition } from './audition';
import { CATEGORIES, isCategory, splitCategory, TAGS, type Category } from './categories';
import { makePreset, newPresetId, parsePresetFile, presetToJson, stepPreset } from './library';
import {
  allPresets,
  categoryFilter,
  generateCategory,
  hoverAudition,
  isModified,
  isUserPreset,
  query,
  saveUserPresets,
  tagFilter,
  userPresets,
  userStore,
  visiblePresets,
} from './state';
import './presets.css';

/** Short messages for the app's toast. */
export type Notify = (message: string) => void;

const GROUPS = ['All', 'UI', 'Foley', 'Game', 'Mine'] as const;
type Group = (typeof GROUPS)[number];

/** The group segment the current filter belongs to ('UI/Click' -> 'UI', 'User' -> 'Mine'). */
function activeGroup(filter: string | null): Group {
  if (!filter) return 'All';
  if (filter === 'User') return 'Mine';
  const g = filter.includes('/') ? splitCategory(filter)[0] : filter;
  return (GROUPS as readonly string[]).includes(g) ? (g as Group) : 'All';
}

/** Close a popover on Escape or a click outside it. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return ref;
}

function SavePopover(props: { onDone: () => void; notify: Notify }) {
  const cur = currentPreset.value;
  const name = useSignal(cur?.name ?? 'My sound');
  const category = useSignal<string>(cur?.category ?? generateCategory.value);
  const submit = (e: Event) => {
    e.preventDefault();
    const trimmed = name.value.trim() || 'Untitled';
    const overwrite = cur && isUserPreset(cur) && cur.name === trimmed;
    const preset = makePreset({
      id: overwrite ? cur.id : newPresetId(),
      name: trimmed,
      category: category.value,
      tags: cur?.tags ?? [],
      patch: patch.value,
    });
    saveUserPresets(userStore.save(preset));
    actions.loadPreset(preset);
    props.notify(`Saved “${trimmed}” to My presets`);
    props.onDone();
  };
  return (
    <form class="popover save-popover" onSubmit={submit} aria-label="Save preset">
      <span class="eyebrow">Save to my presets</span>
      <input
        aria-label="Preset name"
        value={name.value}
        onInput={(e) => (name.value = e.currentTarget.value)}
        autoFocus
      />
      <select
        aria-label="Preset category"
        value={category.value}
        onChange={(e) => (category.value = e.currentTarget.value)}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <div class="popover-actions">
        <button type="button" class="btn" onClick={props.onDone}>
          Cancel
        </button>
        <button type="submit" class="btn primary">
          Save
        </button>
      </div>
    </form>
  );
}

/** Header preset bar: previous / current name / next, and Save. */
export function PresetBar(props: { notify: Notify }) {
  const saving = useSignal(false);
  const ref = useDismiss(saving.value, () => (saving.value = false));
  const cur = currentPreset.value;
  const step = (dir: 1 | -1) => {
    const list = visiblePresets.value.length ? visiblePresets.value : allPresets.value;
    const next = stepPreset(list, cur?.id, dir);
    if (next) loadAndPlay(next);
  };
  return (
    <div class="preset-bar">
      <button type="button" class="btn icon" aria-label="Previous preset" onClick={() => step(-1)}>
        ‹
      </button>
      <div class="preset-current">
        <span class="preset-current-name">
          {cur?.name ?? 'Init'}
          {isModified.value && (
            <span class="modified" title="Modified">
              {' '}
              *
            </span>
          )}
        </span>
        <span class="preset-current-cat">{cur?.category ?? 'Default patch'}</span>
      </div>
      <button type="button" class="btn icon" aria-label="Next preset" onClick={() => step(1)}>
        ›
      </button>
      <div class="popover-anchor" ref={ref}>
        <button
          type="button"
          class="btn"
          aria-expanded={saving.value}
          onClick={() => (saving.value = !saving.value)}
        >
          Save
        </button>
        {saving.value && <SavePopover notify={props.notify} onDone={() => (saving.value = false)} />}
      </div>
    </div>
  );
}

function PresetRows() {
  const list = visiblePresets.value;
  const cur = currentPreset.value;
  if (!list.length) return <p class="preset-empty">No presets match.</p>;
  return (
    <ul class="preset-list" aria-label="Presets">
      {list.map((p) => (
        <li
          key={p.id}
          class={cur?.id === p.id ? 'current' : ''}
          onMouseEnter={() => hoverAudition.value && void audition(p.patch, false, PREVIEW_NOTE)}
        >
          <button
            type="button"
            class="preset-audition"
            aria-label={`Audition ${p.name}`}
            title="Audition without loading"
            onClick={() => void audition(p.patch, true, PREVIEW_NOTE)}
          >
            <span class="tri" aria-hidden="true" />
          </button>
          <button type="button" class="preset-item" onClick={() => loadAndPlay(p)} title="Load preset">
            <span class="preset-item-name">{p.name}</span>
            <span class="preset-item-meta">
              {p.category}
              {p.tags.length > 0 && ` · ${p.tags.join(', ')}`}
            </span>
          </button>
          {isUserPreset(p) && (
            <button
              type="button"
              class="preset-delete"
              aria-label={`Delete ${p.name}`}
              title="Delete"
              onClick={() => {
                if (confirm(`Delete "${p.name}"?`)) saveUserPresets(userStore.remove(p.id));
              }}
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Left sidebar: Generate, search, category and tag filters, the preset list, import and export. */
export function PresetSidebar(props: { notify: Notify }) {
  const { notify } = props;
  const filter = categoryFilter.value;
  const group = activeGroup(filter);
  const factory = allPresets.value.filter((p) => !isUserPreset(p));
  const leaves =
    group === 'All' || group === 'Mine' ? [] : CATEGORIES.filter((c) => c.startsWith(`${group}/`));

  const pickGroup = (g: Group) => {
    categoryFilter.value = g === 'All' ? null : g === 'Mine' ? 'User' : g;
  };

  const importFile = async (file: File) => {
    try {
      const presets = parsePresetFile(registry, await file.text());
      let list = userPresets.value;
      for (const p of presets) list = userStore.save(p);
      saveUserPresets(list);
      categoryFilter.value = 'User';
      loadAndPlay(presets[0]!);
      notify(`Imported ${presets.length} preset${presets.length === 1 ? '' : 's'}`);
    } catch (e) {
      notify(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const exportJson = () => {
    const cur = currentPreset.value;
    const preset = makePreset({
      id: cur?.id ?? newPresetId(),
      name: cur?.name ?? 'Untitled',
      category: cur?.category ?? generateCategory.value,
      tags: cur?.tags ?? [],
      ...(cur?.author ? { author: cur.author } : {}),
      patch: patch.value,
    });
    downloadText(`${presetSlug(preset.name)}.preset.json`, presetToJson(preset));
  };

  return (
    <aside class="browse" aria-label="Preset browser">
      <div class="browse-generate">
        <span class="eyebrow">Generate a new sound</span>
        <div class="browse-generate-row">
          <select
            aria-label="Sound to generate"
            value={generateCategory.value}
            onChange={(e) => (generateCategory.value = e.currentTarget.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            class="btn accent"
            title="Generate a new sound of this kind"
            onClick={() => generate(generateCategory.value)}
          >
            <span class="die" aria-hidden="true">
              ⚄
            </span>
            Generate
          </button>
        </div>
      </div>

      <div class="browse-filters">
        <input
          type="search"
          placeholder="Search presets"
          aria-label="Search presets"
          value={query.value}
          onInput={(e) => (query.value = e.currentTarget.value)}
        />
        <div class="seg fill" role="radiogroup" aria-label="Preset group">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={g === group}
              class={g === group ? 'on' : ''}
              onClick={() => pickGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
        {leaves.length > 0 && (
          <div class="chips" role="group" aria-label="Categories">
            {leaves.map((c) => {
              const on = filter === c;
              return (
                <button
                  key={c}
                  type="button"
                  class={`chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    categoryFilter.value = on ? group : c;
                    if (!on && isCategory(c)) generateCategory.value = c;
                  }}
                >
                  {splitCategory(c)[1]}
                  <span class="chip-count">{factory.filter((p) => p.category === c).length}</span>
                </button>
              );
            })}
          </div>
        )}
        <div class="chips" role="group" aria-label="Filter by tag">
          {TAGS.map((t) => {
            const on = tagFilter.value.includes(t);
            return (
              <button
                key={t}
                type="button"
                class={`tag${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  (tagFilter.value = on ? tagFilter.value.filter((x) => x !== t) : [...tagFilter.value, t])
                }
              >
                #{t}
              </button>
            );
          })}
        </div>
      </div>

      <div class="browse-list">
        <PresetRows />
      </div>

      <div class="browse-foot">
        <button
          type="button"
          role="switch"
          aria-checked={hoverAudition.value}
          class={`switch small${hoverAudition.value ? ' on' : ''}`}
          onClick={() => (hoverAudition.value = !hoverAudition.value)}
        >
          <span class="switch-track" aria-hidden="true">
            <span class="switch-knob" />
          </span>
          <span class="switch-text">Audition on hover</span>
        </button>
        <span class="spacer" />
        <label class="link-btn">
          Import
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) void importFile(file);
            }}
          />
        </label>
        <button type="button" class="link-btn" onClick={exportJson}>
          Export JSON
        </button>
      </div>
    </aside>
  );
}
