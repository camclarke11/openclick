const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 60 → 'C4'. */
export function noteName(note: number): string {
  const n = Math.round(note);
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
