import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { toNormalized, type NumberParam } from '../core';
import { formatValue, nudge } from './controls';
import { snap } from './Knob';

/** Pill switch. `color` overrides the "on" track colour (layer colours). */
export function Switch(props: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  /** Visible text next to the switch; without it `label` is only the accessible name. */
  text?: ComponentChildren;
  small?: boolean;
  color?: string;
  title?: string;
}) {
  const { on, onChange, label, text, small, color, title } = props;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      class={`switch${small ? ' small' : ''}${on ? ' on' : ''}`}
      style={color && on ? { '--switch-on': color } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
    >
      <span class="switch-track" aria-hidden="true">
        <span class="switch-knob" />
      </span>
      {text && <span class="switch-text">{text}</span>}
    </button>
  );
}

/** Segmented button group for short enums. */
export function Segmented<T extends string>(props: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  render?: (o: T) => ComponentChildren;
  class?: string;
}) {
  const { options, value, onChange, label, render } = props;
  return (
    <div class={`seg ${props.class ?? ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          class={o === value ? 'on' : ''}
          onClick={(e) => {
            e.stopPropagation();
            onChange(o);
          }}
        >
          {render ? render(o) : o}
        </button>
      ))}
    </div>
  );
}

/** Pixels of horizontal drag for a full sweep; Shift slows it down for fine moves. */
const SCRUB_RANGE = 200;
const FINE = 0.15;

/**
 * Horizontal scrub slider: drag left/right, Shift for fine, double-click to reset. A focusable
 * slider for the keyboard (arrows, Page Up/Down, Home/End, Delete resets). Bipolar params fill
 * from zero.
 */
export function Scrub(props: {
  id?: string;
  spec: NumberParam;
  value: number;
  onChange: (v: number) => void;
  /** Overrides the visible label (the accessible name stays spec.label unless `ariaLabel`). */
  label?: string;
  ariaLabel?: string;
  color?: string;
  children?: ComponentChildren;
}) {
  const { spec, value, onChange } = props;
  const drag = useRef<{ x: number; acc: number; start: number } | null>(null);
  const t = Math.min(1, Math.max(0, toNormalized(spec, value)));
  const z = spec.min < 0 && spec.max > 0 ? toNormalized(spec, 0) : 0;
  const text = formatValue(spec, value);
  const set = (v: number) => v !== value && onChange(v);

  const onKeyDown = (e: KeyboardEvent) => {
    const small = e.shiftKey ? 0.001 : 0.01;
    const next =
      e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? nudge(spec, value, small)
        : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
          ? nudge(spec, value, -small)
          : e.key === 'PageUp'
            ? nudge(spec, value, 0.1)
            : e.key === 'PageDown'
              ? nudge(spec, value, -0.1)
              : e.key === 'Home'
                ? spec.min
                : e.key === 'End'
                  ? spec.max
                  : e.key === 'Delete' || e.key === 'Backspace'
                    ? spec.default
                    : null;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    set(next);
  };

  return (
    <div
      id={props.id}
      class="scrub"
      role="slider"
      tabIndex={0}
      aria-label={props.ariaLabel ?? spec.label}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={value}
      aria-valuetext={text}
      title={`${spec.hint ? `${spec.hint}\n` : ''}Drag, Shift for fine, double-click to reset`}
      style={props.color ? { '--scrub': props.color } : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic events have no pointer to capture.
        }
        el.focus();
        drag.current = { x: e.clientX, acc: 0, start: value };
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.acc += ((e.clientX - d.x) / SCRUB_RANGE) * (e.shiftKey ? FINE : 1);
        d.x = e.clientX;
        set(snap(spec, nudge({ ...spec, step: undefined }, d.start, d.acc)));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onClick={(e) => e.stopPropagation()}
      onDblClick={(e) => {
        e.stopPropagation();
        set(spec.default);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        class="scrub-fill"
        style={{ left: `${Math.min(t, z) * 100}%`, width: `${Math.abs(t - z) * 100}%` }}
      />
      {props.children}
      <div class="scrub-text">
        <span class="scrub-label">{props.label ?? spec.label}</span>
        <span class="mono">{text}</span>
      </div>
    </div>
  );
}

/** Small uppercase section heading used across the panels. */
export function Eyebrow(props: { children: ComponentChildren; as?: 'h2' | 'span' }) {
  const Tag = props.as ?? 'h2';
  return <Tag class="eyebrow">{props.children}</Tag>;
}
