import { useRef, useState } from 'preact/hooks';
import { sanitizeParam, type StepsParam } from '../core';

/**
 * Editor for `steps` params (sequencer and arp lanes). Click or drag across the bars to draw,
 * double-click a bar to reset it. Keyboard: Left/Right pick a step, Up/Down change it (Shift
 * for fine), Delete resets the step.
 */
export function StepLane(props: {
  id: string;
  spec: StepsParam;
  value: number[];
  onChange: (v: number[]) => void;
  /** Steps that play; later steps are drawn dimmed (lane length, sequencer length). */
  activeLength?: number;
  /** Step being played right now, highlighted. */
  playing?: number;
  /** Show each active step's value as text: signed ('+7'), times ('×2') or none. */
  text?: 'signed' | 'times';
  color?: string;
}) {
  const { id, spec, value, onChange, activeLength = spec.length, playing = -1, text } = props;
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const drawing = useRef(false);
  const range = spec.max - spec.min;
  const zero = spec.min < 0 && spec.max > 0 ? 0 : spec.min;
  const norm = (v: number) => (v - spec.min) / range;

  const setStep = (i: number, v: number) => {
    const next = sanitizeParam(
      spec,
      value.map((x, j) => (j === i ? v : x)),
    ) as number[];
    if (next[i] !== value[i]) onChange(next);
  };

  const fromPointer = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.min(
      spec.length - 1,
      Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * spec.length)),
    );
    const t = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setCursor(i);
    setStep(i, spec.min + t * range);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const inc = spec.step ?? range / (e.shiftKey ? 100 : 20);
    const cur = value[cursor] ?? zero;
    switch (e.key) {
      case 'ArrowLeft':
        setCursor(Math.max(0, cursor - 1));
        break;
      case 'ArrowRight':
        setCursor(Math.min(spec.length - 1, cursor + 1));
        break;
      case 'ArrowUp':
        setStep(cursor, cur + inc);
        break;
      case 'ArrowDown':
        setStep(cursor, cur - inc);
        break;
      case 'Delete':
      case 'Backspace':
        setStep(cursor, spec.default[cursor] ?? zero);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const fmt = (v: number) => (spec.step && spec.step >= 1 ? String(v) : v.toFixed(2));

  return (
    <div
      id={id}
      class={`steplane${focused ? ' focused' : ''}`}
      style={props.color ? { '--lane': props.color } : undefined}
      role="group"
      tabIndex={0}
      aria-label={`${spec.label}: ${value.map(fmt).join(', ')}`}
      aria-roledescription="step editor"
      title={spec.hint}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drawing.current = true;
        fromPointer(e);
      }}
      onPointerMove={(e) => drawing.current && fromPointer(e)}
      onPointerUp={() => (drawing.current = false)}
      onPointerCancel={() => (drawing.current = false)}
      onDblClick={() => setStep(cursor, spec.default[cursor] ?? zero)}
    >
      {value.map((v, i) => {
        const a = norm(zero);
        let lo = Math.min(a, norm(v));
        let h = Math.abs(norm(v) - a);
        // Zero-height steps still show a sliver so the lane reads as drawable.
        if (h < 0.05) {
          h = 0.05;
          lo = a > 0 ? a - 0.025 : 0;
        }
        const active = i < activeLength;
        const label = !active || !text ? '' : text === 'times' ? `×${v}` : v > 0 ? `+${fmt(v)}` : fmt(v);
        return (
          <div
            key={i}
            class={`step${i === cursor && focused ? ' cursor' : ''}${active ? '' : ' inactive'}${i === playing ? ' playing' : ''}`}
            title={fmt(v)}
          >
            <div class="step-bar" style={{ bottom: `${lo * 100}%`, height: `${h * 100}%` }} />
            {label && <span class="step-text">{label}</span>}
          </div>
        );
      })}
    </div>
  );
}
