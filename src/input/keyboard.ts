import { signal } from '@preact/signals';
import type { BusEvents, EventBus } from '../core';
import { clamp } from './notes';

/**
 * Computer keyboard input: a two-row piano (A–K white keys, W–U black keys, extending to ; and
 * P), Z/X shift the octave, Escape is panic. Mapped by physical key (`event.code`) so it works
 * on any layout.
 */
export const KEY_SEMITONES: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
};

export const MIN_OCTAVE = 0;
export const MAX_OCTAVE = 8;

/** Octave of the A key (and the bottom-left pad). 4 → A plays C4 (MIDI 60). */
export const octave = signal(4);

/** MIDI note of the lowest key/pad at an octave. */
export const octaveBase = (oct: number): number => (oct + 1) * 12;

export interface KeyLike {
  code: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type KeyAction =
  { type: 'note'; semitone: number } | { type: 'octave'; delta: number } | { type: 'panic' } | null;

/** What a key press means, ignoring where focus is. Pure, for tests. */
export function keyAction(e: KeyLike): KeyAction {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.code === 'Escape') return { type: 'panic' };
  if (e.repeat) return null;
  if (e.code === 'KeyZ') return { type: 'octave', delta: -1 };
  if (e.code === 'KeyX') return { type: 'octave', delta: 1 };
  const semitone = KEY_SEMITONES[e.code];
  return semitone === undefined ? null : { type: 'note', semitone };
}

/** True when keys should go to a form field rather than play notes. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const field = el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  if (!field) return false;
  // Checkboxes, buttons and ranges don't take text, so notes still play while they're focused.
  if (field instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(field.type);
  }
  return true;
}

export function shiftOctave(delta: number): void {
  octave.value = clamp(octave.value + delta, MIN_OCTAVE, MAX_OCTAVE);
}

/** Listen on `target` (default window) and emit notes on the bus. Returns a detach function. */
export function attachKeyboard(bus: EventBus<BusEvents>, target: Window = window): () => void {
  // Remember which note each held key played, so key-up releases it even if the octave moved.
  const held = new Map<string, number>();

  const releaseAll = () => {
    for (const note of held.values()) bus.emit('noteOff', { note, source: 'keyboard' });
    held.clear();
  };

  const onDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const action = keyAction(e);
    if (!action) return;
    e.preventDefault();
    if (action.type === 'panic') {
      releaseAll();
      bus.emit('panic', {});
    } else if (action.type === 'octave') {
      shiftOctave(action.delta);
    } else if (!held.has(e.code)) {
      const note = octaveBase(octave.value) + action.semitone;
      held.set(e.code, note);
      bus.emit('noteOn', { note, velocity: 0.8, source: 'keyboard' });
    }
  };

  const onUp = (e: KeyboardEvent) => {
    const note = held.get(e.code);
    if (note === undefined) return;
    held.delete(e.code);
    bus.emit('noteOff', { note, source: 'keyboard' });
  };

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', releaseAll);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', releaseAll);
    releaseAll();
  };
}
