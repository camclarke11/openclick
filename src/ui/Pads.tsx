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
  // Held presses (pointer or Enter/Space) → the pad and the note it played, in a ref so
  // back-to-back events see each other's changes and releases match even if the octave moves.
  const held = useRef(new Map<string, { padId: number; note: number }>());
  const [heldPads, setHeldPads] = useState<ReadonlySet<number>>(new Set());
  const syncHeld = () => setHeldPads(new Set([...held.current.values()].map((h) => h.padId)));

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
    hold(`p${e.pointerId}`, padId, velocity);
  };

  const hold = (key: string, padId: number, velocity: number) => {
    const note = padNote(padId, base);
    held.current.set(key, { padId, note });
    syncHeld();
    bus.emit('noteOn', { note, velocity, source: 'pad', padId });
  };
  const unhold = (key: string) => {
    const h = held.current.get(key);
    if (!h) return;
    held.current.delete(key);
    syncHeld();
    bus.emit('noteOff', { note: h.note, source: 'pad' });
  };
  const release = (e: PointerEvent) => unhold(`p${e.pointerId}`);

  const isPlayKey = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';
  const onKeyDown = (padId: number, e: KeyboardEvent) => {
    if (!isPlayKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) hold(`k${padId}:${e.key}`, padId, 0.8);
  };
  const onKeyUp = (padId: number, e: KeyboardEvent) => {
    if (!isPlayKey(e)) return;
    e.preventDefault();
    unhold(`k${padId}:${e.key}`);
  };
  const onBlur = (padId: number) => {
    unhold(`k${padId}:Enter`);
    unhold(`k${padId}: `);
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
            onKeyUp={(e) => onKeyUp(padId, e)}
            onBlur={() => onBlur(padId)}
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
