import { num, steps, str, type NoteEvent, type Params, type Rng } from '../core';
import { DIVISION_BEATS, LANES, MAX_STEPS, type Lane } from './schema';

/** Seconds per arp step for the current rate settings. */
export function stepSeconds(p: Params): number {
  if (str(p, 'rateMode') === 'ms') return num(p, 'rateMs') / 1000;
  const beats = DIVISION_BEATS[str(p, 'division') as keyof typeof DIVISION_BEATS] ?? 1 / 4;
  return (60 / num(p, 'tempo')) * beats;
}

/**
 * Position within a lane of length `len` at play step `i` for a deterministic direction.
 * Ping-pong does not repeat the end points: 0 1 2 3 2 1 0 1 ...
 */
export function lanePosition(direction: string, i: number, len: number): number {
  if (len <= 1) return 0;
  switch (direction) {
    case 'reverse':
      return len - 1 - (i % len);
    case 'ping-pong': {
      const period = 2 * len - 2;
      const k = i % period;
      return k < len ? k : period - k;
    }
    default:
      return i % len;
  }
}

const clampLen = (v: number) => Math.min(MAX_STEPS, Math.max(1, Math.round(v)));

/**
 * Expand one played note into the arp's timed note list. Pure and allocation-light: it runs on
 * every pad hit. Random direction draws one value per step from `rng` and maps it onto each
 * lane, so lanes stay locked together when they share a length.
 */
export function expandArp(p: Params, ev: NoteEvent, rng: Rng): NoteEvent[] {
  const total = Math.max(1, Math.round(num(p, 'steps')));
  const dt = stepSeconds(p);
  const swing = (num(p, 'swing') / 100) * (dt / 3);
  const direction = str(p, 'direction');
  const poly = p.polymeter === true;
  const masterLen = clampLen(num(p, 'pitchLength'));
  const lens = {} as Record<Lane, number>;
  const vals = {} as Record<Lane, number[]>;
  for (const lane of LANES) {
    lens[lane] = poly ? clampLen(num(p, `${lane}Length`)) : masterLen;
    vals[lane] = steps(p, lane);
  }
  const at = (lane: Lane, i: number, r: number): number => {
    const len = lens[lane];
    const idx = direction === 'random' ? Math.floor(r * len) : lanePosition(direction, i, len);
    return vals[lane][idx] ?? 0;
  };

  const out: NoteEvent[] = [];
  for (let i = 0; i < total; i++) {
    const r = direction === 'random' ? rng.next() : 0;
    const velocity = ev.velocity * at('velocity', i, r);
    if (velocity <= 0) continue;
    const note = ev.note + at('pitch', i, r);
    const pan = Math.max(-1, Math.min(1, ev.pan + at('pan', i, r)));
    const reps = Math.max(1, Math.round(at('repeats', i, r)));
    const sub = dt / reps;
    const gate = sub * Math.max(0.02, at('gate', i, r));
    const start = ev.time + i * dt + (i % 2 === 1 ? swing : 0);
    for (let k = 0; k < reps; k++) {
      out.push({ note, velocity, pan, gate, time: start + k * sub });
    }
  }
  return out;
}
