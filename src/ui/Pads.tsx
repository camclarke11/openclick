import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../core';
import {
  noteName,
  octave,
  octaveBase,
  PAD_COUNT,
  padForNote,
  padIdAt,
  padNote,
  velocityFromY,
} from '../input';

/** How long a pad stays lit after a note that didn't come from holding it. */
const FLASH_MS = 150;

/**
 * 4×4 pad grid playing the current patch chromatically from the keyboard octave. Velocity
 * comes from where the pad is hit (top = loud); multi-touch works because each pad tracks its
 * own pointers. Pads light up for notes from any input.
 */
export function Pads() {
  const base = octaveBase(octave.value);
  const [lit, setLit] = useState<ReadonlySet<number>>(new Set());
  // pointerId → pad, in a ref so back-to-back pointer events see each other's changes.
  const held = useRef(new Map<number, number>());
  const [heldPads, setHeldPads] = useState<ReadonlySet<number>>(new Set());
  const syncHeld = () => setHeldPads(new Set(held.current.values()));

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = bus.on('noteOn', (m) => {
      const id = m.padId ?? padForNote(m.note, octaveBase(octave.value));
      if (id === undefined) return;
      setLit((s) => new Set(s).add(id));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setLit((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }, FLASH_MS);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  const press = (padId: number, e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    // Capture so the release lands here even if the finger slides off.
    if (el.setPointerCapture && e.pointerId !== undefined) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events (tests) have no active pointer to capture.
      }
    }
    const rect = el.getBoundingClientRect();
    const velocity = velocityFromY(e.clientY, rect.top, rect.height);
    held.current.set(e.pointerId, padId);
    syncHeld();
    bus.emit('noteOn', { note: padNote(padId, base), velocity, source: 'pad', padId });
  };
  const release = (e: PointerEvent) => {
    const padId = held.current.get(e.pointerId);
    if (padId === undefined) return;
    held.current.delete(e.pointerId);
    syncHeld();
    bus.emit('noteOff', { note: padNote(padId, base), source: 'pad' });
  };

  const onKeyDown = (padId: number, e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) bus.emit('noteOn', { note: padNote(padId, base), velocity: 0.8, source: 'pad', padId });
  };

  return (
    <div class="pads" role="group" aria-label="Pads">
      {Array.from({ length: PAD_COUNT }, (_, i) => {
        const padId = padIdAt(i);
        const on = lit.has(padId) || heldPads.has(padId);
        return (
          <button
            key={padId}
            type="button"
            class={`pad${on ? ' lit' : ''}`}
            data-pad={padId}
            aria-label={`Pad ${padId + 1} ${noteName(padNote(padId, base))}`}
            onPointerDown={(e) => press(padId, e)}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={(e) => onKeyDown(padId, e)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span class="pad-num">{padId + 1}</span>
            <span class="pad-note">{noteName(padNote(padId, base))}</span>
          </button>
        );
      })}
    </div>
  );
}
