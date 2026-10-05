import { useState } from 'preact/hooks';
import type { NumberParam, ParamSpec } from '../core';
import { registry } from '../modules';
import { actions, patch } from '../state/store';
import { Scrub, Switch } from './widgets';

/**
 * The serial effects chain as a row of cards: drag a card to reorder (or use the arrow buttons),
 * bypass, randomise, remove, and add from the catalogue at the end.
 */
export function FxChain() {
  const fx = patch.value.fx;
  const available = [...registry.effects.values()];
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= fx.length || from === to) return;
    actions.moveFx(from, to);
  };

  return (
    <div class="fx" role="group" aria-label="Effects">
      <ol class="fx-list">
        {fx.map((slot, i) => {
          const mod = registry.effects.get(slot.type);
          if (!mod) return null;
          const entries = Object.entries(mod.schema) as [string, ParamSpec][];
          return (
            <li
              key={`${i}-${slot.type}`}
              class={`fx-card${slot.enabled ? '' : ' bypassed'}${dropAt === i && dragFrom !== i ? ' drop' : ''}`}
              aria-label={`${mod.label} (slot ${i + 1})`}
              draggable
              onDragStart={(e) => {
                // Let scrubs and buttons inside the card keep their own pointer handling.
                if ((e.target as HTMLElement).closest('.scrub, button, select')) {
                  e.preventDefault();
                  return;
                }
                setDragFrom(i);
                e.dataTransfer?.setData('text/plain', String(i));
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
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
              <div class="fx-head">
                <span class="drag-handle" title="Drag to reorder" aria-hidden="true">
                  ⋮⋮
                </span>
                <span class="fx-num mono">{String(i + 1).padStart(2, '0')}</span>
                <span class="fx-title">{mod.label}</span>
                <span class="spacer" />
                <Switch
                  small
                  on={slot.enabled}
                  label={`${mod.label} enabled`}
                  title="Bypass"
                  onChange={(on) => actions.setFxEnabled(i, on)}
                />
                <button
                  type="button"
                  class="icon-ghost die"
                  aria-label={`Randomise ${mod.label}`}
                  title="Randomise effect"
                  onClick={() => actions.randomizeFx(i)}
                >
                  ⚄
                </button>
                <button
                  type="button"
                  class="icon-ghost danger"
                  aria-label={`Remove ${mod.label}`}
                  title="Remove"
                  onClick={() => actions.removeFx(i)}
                >
                  ✕
                </button>
              </div>
              <div class="fx-params">
                {entries.map(([k, spec]) => {
                  const id = `fx${i}-${k}`;
                  if (spec.kind === 'number') {
                    return (
                      <Scrub
                        key={k}
                        id={id}
                        spec={spec as NumberParam}
                        value={slot.params[k] as number}
                        onChange={(v) => actions.setFxParam(i, k, v)}
                      />
                    );
                  }
                  if (spec.kind === 'bool') {
                    return (
                      <Switch
                        key={k}
                        small
                        on={slot.params[k] === true}
                        label={spec.label}
                        text={spec.label}
                        title={spec.hint}
                        onChange={(on) => actions.setFxParam(i, k, on)}
                      />
                    );
                  }
                  if (spec.kind === 'enum') {
                    return (
                      <select
                        key={k}
                        id={id}
                        aria-label={spec.label}
                        value={String(slot.params[k])}
                        onChange={(e) => actions.setFxParam(i, k, e.currentTarget.value)}
                      >
                        {spec.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return null;
                })}
              </div>
              <div class="fx-move">
                <button
                  type="button"
                  aria-label={`Move ${mod.label} earlier`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label={`Move ${mod.label} later`}
                  disabled={i === fx.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  →
                </button>
              </div>
            </li>
          );
        })}
        <li class="fx-add">
          <span class="muted">Add effect</span>
          <div class="fx-add-grid">
            {available.map((m) => (
              <button
                key={m.type}
                type="button"
                aria-label={`Add ${m.label}`}
                onClick={() => actions.addFx(m.type)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </li>
      </ol>
    </div>
  );
}
