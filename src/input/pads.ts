import { clamp } from './notes';

export const PAD_ROWS = 4;
export const PAD_COLS = 4;
export const PAD_COUNT = PAD_ROWS * PAD_COLS;

/**
 * Pads are numbered 0..15 from the bottom-left, rising chromatically left to right then upward,
 * like a hardware pad controller. `visualIndex` is DOM order (top-left first).
 */
export function padIdAt(visualIndex: number): number {
  const row = Math.floor(visualIndex / PAD_COLS);
  const col = visualIndex % PAD_COLS;
  return (PAD_ROWS - 1 - row) * PAD_COLS + col;
}

export const padNote = (padId: number, baseNote: number): number => baseNote + padId;

/** Pad for a played note, if it falls on the grid. */
export function padForNote(note: number, baseNote: number): number | undefined {
  const id = Math.round(note) - baseNote;
  return id >= 0 && id < PAD_COUNT ? id : undefined;
}

/** Velocity from where the pad was hit: top edge is full velocity, bottom edge is soft. */
export function velocityFromY(y: number, top: number, height: number): number {
  if (!(height > 0)) return 1;
  const t = clamp((y - top) / height, 0, 1);
  return Math.round((1 - 0.8 * t) * 100) / 100;
}
