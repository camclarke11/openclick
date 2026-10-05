import { useRef } from 'preact/hooks';
import { toNormalized, type NumberParam } from '../core';
import { formatValue, nudge } from './controls';

/** Pixels of vertical drag for a full sweep; Shift divides speed by 10 for fine moves. */
const DRAG_RANGE = 200;
const FINE = 0.1;
const ARC = 270;

/**
 * Rotary knob for number params. Drag up/down, scroll, double-click to reset, Shift for fine
 * moves; as a focusable slider it takes arrows, Page Up/Down, Home/End and Delete (reset).
 */
export function Knob(props: {
  id: string;
  spec: NumberParam;
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const { id, spec, value, onChange, size = 54 } = props;
  const drag = useRef<{ y: number; start: number; acc: number } | null>(null);
  const t = Math.min(1, Math.max(0, toNormalized(spec, value)));
  const angle = -ARC / 2 + t * ARC;
  const bipolar = spec.min < 0 && spec.max > 0;
  const zeroT = bipolar ? toNormalized(spec, 0) : 0;
  const text = formatValue(spec, value);

  const set = (v: number) => v !== value && onChange(v);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    drag.current = { y: e.clientY, start: value, acc: 0 };
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Accumulate in normalised space so fine moves on stepped params still add up.
    d.acc += ((d.y - e.clientY) / DRAG_RANGE) * (e.shiftKey ? FINE : 1);
    d.y = e.clientY;
    set(nudgeFrom(spec, d.start, d.acc));
  };
  const onPointerUp = () => (drag.current = null);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    set(nudge(spec, value, dir * (e.shiftKey ? 0.002 : 0.02)));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const small = e.shiftKey ? 0.001 : 0.01;
    let next: number;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = nudge(spec, value, small);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = nudge(spec, value, -small);
        break;
      case 'PageUp':
        next = nudge(spec, value, 0.1);
        break;
      case 'PageDown':
        next = nudge(spec, value, -0.1);
        break;
      case 'Home':
        next = spec.min;
        break;
      case 'End':
        next = spec.max;
        break;
      case 'Delete':
      case 'Backspace':
        next = spec.default;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    set(next);
  };

  // Design geometry: a 270° arc of radius 23 in a 56-unit box, drawn with dash offsets.
  const ARC_LEN = 108.4;
  return (
    <div
      id={id}
      class="knob"
      role="slider"
      tabIndex={0}
      aria-label={spec.label}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={value}
      aria-valuetext={text}
      title={`${spec.hint ? `${spec.hint}\n` : ''}Drag or scroll, Shift for fine, double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDblClick={() => set(spec.default)}
      onKeyDown={onKeyDown}
    >
      <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
        <circle
          class="knob-track"
          cx="28"
          cy="28"
          r="23"
          stroke-dasharray={`${ARC_LEN} 200`}
          transform="rotate(135 28 28)"
        />
        {t !== zeroT && (
          <circle
            class="knob-value"
            cx="28"
            cy="28"
            r="23"
            stroke-dasharray={`${(ARC_LEN * Math.abs(t - zeroT)).toFixed(2)} 200`}
            stroke-dashoffset={(-ARC_LEN * Math.min(t, zeroT)).toFixed(2)}
            transform="rotate(135 28 28)"
          />
        )}
        <circle class="knob-cap" cx="28" cy="28" r="16" />
        <line class="knob-pointer" x1="28" y1="28" x2="28" y2="16" transform={`rotate(${angle} 28 28)`} />
      </svg>
    </div>
  );
}

function nudgeFrom(spec: NumberParam, start: number, acc: number): number {
  // Unlike nudge(), a drag doesn't force a one-step move: it waits for enough travel, then snaps.
  return snap(spec, nudge({ ...spec, step: undefined }, start, acc));
}

export function snap(spec: NumberParam, v: number): number {
  if (!spec.step) return v;
  const x = Math.round((v - spec.min) / spec.step) * spec.step + spec.min;
  return Math.min(spec.max, Math.max(spec.min, x));
}
