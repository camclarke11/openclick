import { useState } from 'preact/hooks';
import { registry } from '../modules';
import { actions, patch } from '../state/store';
import { SchemaPanel } from './SchemaPanel';

const fxLabel = (type: string) => registry.effects.get(type)?.label ?? type;

/**
 * The serial effects chain: add from the registry, reorder by dragging the handle (or the
 * arrow buttons on touch and keyboard), bypass, remove, randomise, collapse.
 */
export function FxChain() {
  const fx = patch.value.fx;
  const available = [...registry.effects.values()];
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());

  const toggleCollapsed = (i: number) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= fx.length || from === to) return;
    actions.moveFx(from, to);
    // Collapse state follows positions, so reset it rather than show the wrong slots folded.
    setCollapsed(new Set());
  };

  const remove = (i: number) => {
    actions.removeFx(i);
    setCollapsed(new Set());
  };

  return (
    <section class="panel fx" aria-label="Effects">
      <div class="panel-head">
        <h2>Effects</h2>
        <span class="spacer" />
        <select
          aria-label="Add effect"
          value=""
          disabled={!available.length}
          onChange={(e) => {
            const type = e.currentTarget.value;
            e.currentTarget.value = '';
            if (type) actions.addFx(type);
          }}
        >
          <option value="">{available.length ? '+ Add effect' : 'No effects available yet'}</option>
          {available.map((m) => (
            <option key={m.type} value={m.type}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {fx.length === 0 && <p class="empty">No effects. Add one to colour the sound.</p>}

      <ol class="fx-list">
        {fx.map((slot, i) => {
          const mod = registry.effects.get(slot.type);
          if (!mod) return null;
          const open = !collapsed.has(i);
          return (
            <li
              key={`${i}-${slot.type}`}
              class={`fx-slot${slot.enabled ? '' : ' bypassed'}${dropAt === i && dragFrom !== i ? ' drop' : ''}`}
              aria-label={`${fxLabel(slot.type)} (slot ${i + 1})`}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDropAt(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
                setDropAt(null);
              }}
            >
              <div class="panel-head fx-head">
                <span
                  class="drag-handle"
                  draggable
                  title="Drag to reorder"
                  aria-hidden="true"
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer?.setData('text/plain', String(i));
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDropAt(null);
                  }}
                >
                  ⋮⋮
                </span>
                <label class="toggle" title="Bypass">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={slot.enabled}
                    aria-label={`${fxLabel(slot.type)} enabled`}
                    onChange={(e) => actions.setFxEnabled(i, e.currentTarget.checked)}
                  />
                  <span class="toggle-track" aria-hidden="true" />
                </label>
                <button
                  type="button"
                  class="fx-title"
                  aria-expanded={open}
                  onClick={() => toggleCollapsed(i)}
                >
                  {mod.label}
                </button>
                <span class="spacer" />
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Move ${mod.label} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Move ${mod.label} down`}
                  disabled={i === fx.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="btn"
                  onClick={() => actions.randomizeFx(i)}
                  title="Randomise this effect"
                >
                  Randomise
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Remove ${mod.label}`}
                  title="Remove"
                  onClick={() => remove(i)}
                >
                  ×
                </button>
              </div>
              {open && (
                <SchemaPanel
                  idPrefix={`fx${i}`}
                  schema={mod.schema}
                  params={slot.params}
                  onChange={(k, v) => actions.setFxParam(i, k, v)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
