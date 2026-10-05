import { useSignal } from '@preact/signals';
import { bus, type Patch, type Preset } from '../core';
import { registry } from '../modules';
import { actions, assets, currentPreset, engine, patch } from '../state/store';
import { audition } from './audition';
import { CATEGORIES, categoryTree, isCategory, splitCategory, TAGS, type Category } from './categories';
import { makePreset, newPresetId, parsePresetFile, presetToJson, stepPreset } from './library';
import { generatePatch } from './recipes';
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

const PREVIEW_NOTE = 60;

function play() {
  bus.emit('noteOn', { note: PREVIEW_NOTE, velocity: 0.9, source: 'ui' });
}

/**
 * Play the patch just loaded once its samples and effect worklets are ready. The engine prepares
 * new patches without waiting, and worklet effects pass audio through dry until loaded, so playing
 * straight away would make a preset's first hit miss its bitcrusher or granulizer (or a sample).
 */
async function playWhenReady(p: Patch) {
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

function load(preset: Preset) {
  actions.loadPreset(preset);
  void playWhenReady(patch.value);
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'preset';

/** Generate an on-target sound for a category ("smart randomise") and load it as a new, unsaved preset. */
export function generate(category: Category) {
  const p = generatePatch(registry, category);
  actions.loadPreset(
    makePreset({ id: 'generated', name: `New ${splitCategory(category)[1]}`, category, tags: [], patch: p }),
  );
  void playWhenReady(patch.value);
}

function SaveForm(props: { onDone: () => void }) {
  const cur = currentPreset.value;
  const name = useSignal(cur && cur.id !== 'generated' ? cur.name : (cur?.name ?? 'My sound'));
  const category = useSignal(cur?.category ?? generateCategory.value);
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
    props.onDone();
  };
  return (
    <form class="oc-presets-save" onSubmit={submit}>
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
      <button type="submit">Save</button>
      <button type="button" onClick={props.onDone}>
        Cancel
      </button>
    </form>
  );
}

function CategoryNav() {
  const tree = categoryTree(allPresets.value.filter((p) => !isUserPreset(p)).map((p) => p.category));
  const sel = categoryFilter.value;
  const item = (value: string | null, label: string, count: number, cls = '') => (
    <button
      type="button"
      class={`oc-presets-cat ${cls} ${sel === value ? 'is-active' : ''}`}
      aria-pressed={sel === value}
      onClick={() => {
        categoryFilter.value = value;
        if (value && isCategory(value)) generateCategory.value = value;
      }}
    >
      <span>{label}</span>
      <span class="oc-presets-count">{count}</span>
    </button>
  );
  return (
    <nav class="oc-presets-nav" aria-label="Preset categories">
      {item(null, 'All', allPresets.value.length)}
      {item('User', 'My presets', userPresets.value.length)}
      {tree.map((g) => (
        <div key={g.group} class="oc-presets-group">
          {item(g.group, g.group, g.count, 'is-group')}
          {g.leaves.map((l) => (
            <div key={l.category}>{item(l.category, l.leaf, l.count, 'is-leaf')}</div>
          ))}
        </div>
      ))}
    </nav>
  );
}

function PresetList() {
  const list = visiblePresets.value;
  const cur = currentPreset.value;
  if (!list.length) return <p class="oc-presets-empty">No presets match.</p>;
  return (
    <ul class="oc-presets-list" aria-label="Presets">
      {list.map((p) => (
        <li
          key={p.id}
          class={cur?.id === p.id ? 'is-current' : ''}
          onMouseEnter={() => hoverAudition.value && void audition(p.patch, false, PREVIEW_NOTE)}
        >
          <button type="button" class="oc-presets-item" onClick={() => load(p)} title="Load preset">
            <span class="oc-presets-item-name">{p.name}</span>
            <span class="oc-presets-item-meta">
              {p.category}
              {p.tags.length > 0 && ` · ${p.tags.join(', ')}`}
            </span>
          </button>
          <button
            type="button"
            class="oc-presets-icon"
            aria-label={`Audition ${p.name}`}
            title="Audition without loading"
            onClick={() => void audition(p.patch, true, PREVIEW_NOTE)}
          >
            ▶
          </button>
          {isUserPreset(p) && (
            <button
              type="button"
              class="oc-presets-icon"
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

/** Preset bar (name, previous/next, save, generate) with an expandable browser panel. */
export function PresetBrowser() {
  const open = useSignal(false);
  const saving = useSignal(false);
  const message = useSignal<string | null>(null);
  const cur = currentPreset.value;

  const step = (dir: 1 | -1) => {
    const list = visiblePresets.value.length ? visiblePresets.value : allPresets.value;
    const next = stepPreset(list, cur?.id, dir);
    if (next) load(next);
  };

  const importFile = async (file: File) => {
    try {
      const presets = parsePresetFile(registry, await file.text());
      let list = userPresets.value;
      for (const p of presets) list = userStore.save(p);
      saveUserPresets(list);
      categoryFilter.value = 'User';
      actions.loadPreset(presets[0]!);
      message.value = `Imported ${presets.length} preset${presets.length === 1 ? '' : 's'}.`;
    } catch (e) {
      message.value = `Import failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  const exportJson = () => {
    const preset = makePreset({
      id: cur?.id ?? newPresetId(),
      name: cur?.name ?? 'Untitled',
      category: cur?.category ?? generateCategory.value,
      tags: cur?.tags ?? [],
      ...(cur?.author ? { author: cur.author } : {}),
      patch: patch.value,
    });
    downloadText(`${slug(preset.name)}.openclick.json`, presetToJson(preset));
  };

  return (
    <div class="oc-presets">
      <div class="oc-presets-bar">
        <button type="button" class="oc-presets-icon" aria-label="Previous preset" onClick={() => step(-1)}>
          ‹
        </button>
        <button
          type="button"
          class="oc-presets-current"
          aria-expanded={open.value}
          aria-label="Browse presets"
          onClick={() => (open.value = !open.value)}
        >
          <span class="oc-presets-current-name">
            {cur?.name ?? 'Init'}
            {isModified.value && <span title="Modified"> *</span>}
          </span>
          <span class="oc-presets-current-cat">{cur?.category ?? 'Default patch'}</span>
        </button>
        <button type="button" class="oc-presets-icon" aria-label="Next preset" onClick={() => step(1)}>
          ›
        </button>
        <button type="button" onClick={() => (saving.value = !saving.value)}>
          Save
        </button>
        <span class="oc-presets-generate">
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
            title="Generate a new sound of this kind"
            onClick={() => generate(generateCategory.value)}
          >
            Generate
          </button>
        </span>
      </div>
      {saving.value && <SaveForm onDone={() => (saving.value = false)} />}
      {message.value && (
        <p class="oc-presets-message" role="status">
          {message.value}
        </p>
      )}
      {open.value && (
        <div class="oc-presets-panel">
          <div class="oc-presets-tools">
            <input
              type="search"
              placeholder="Search presets"
              aria-label="Search presets"
              value={query.value}
              onInput={(e) => (query.value = e.currentTarget.value)}
            />
            <label class="oc-presets-check">
              <input
                type="checkbox"
                checked={hoverAudition.value}
                onChange={(e) => (hoverAudition.value = e.currentTarget.checked)}
              />
              Audition on hover
            </label>
            <label class="oc-presets-file">
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
            <button type="button" onClick={exportJson}>
              Export JSON
            </button>
          </div>
          <div class="oc-presets-tags" role="group" aria-label="Filter by tag">
            {TAGS.map((t) => {
              const on = tagFilter.value.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  class={`oc-presets-tag ${on ? 'is-active' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    (tagFilter.value = on ? tagFilter.value.filter((x) => x !== t) : [...tagFilter.value, t])
                  }
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div class="oc-presets-body">
            <CategoryNav />
            <PresetList />
          </div>
        </div>
      )}
    </div>
  );
}
