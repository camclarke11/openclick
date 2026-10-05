import { fromNormalized, toNormalized, type NumberParam, type ParamSchema, type ParamSpec } from '../core';

const ms = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)} ms`;

/** Display text for a number param, e.g. "1.20 kHz", "35 ms", "+7 st", "L 40". */
export function formatValue(spec: NumberParam, v: number): string {
  const range = spec.max - spec.min;
  const dec = (x: number) =>
    spec.step && spec.step >= 1 ? 0 : Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2;
  const fixed = (x: number) => x.toFixed(dec(x));
  switch (spec.unit) {
    case 'Hz':
      return v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${fixed(v)} Hz`;
    case 's':
      return v < 1 ? ms(v * 1000) : `${v.toFixed(2)} s`;
    case 'ms':
      return v < 1000 ? ms(v) : `${(v / 1000).toFixed(2)} s`;
    case 'dB':
      return v <= -60 ? '-inf dB' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
    case '%':
      // Fractions (0..1 mix, size) read as whole percentages; 0..100 params are already percent.
      return spec.max <= 1 ? `${Math.round(v * 100)}%` : `${fixed(v)}%`;
    case 'st':
    case 'ct':
      return `${v > 0 ? '+' : ''}${fixed(v)} ${spec.unit}`;
    case undefined:
      if (spec.min === -1 && spec.max === 1 && /pan/i.test(spec.label)) {
        const pct = Math.round(Math.abs(v) * 100);
        return pct === 0 ? 'C' : `${v < 0 ? 'L' : 'R'} ${pct}`;
      }
      return range <= 2 ? v.toFixed(2) : fixed(v);
    default:
      return `${fixed(v)} ${spec.unit}`;
  }
}

/** Move a number param by a fraction of its (curved) range, e.g. from a drag, wheel or arrow key. */
export function nudge(spec: NumberParam, v: number, deltaNorm: number): number {
  if (spec.step) {
    // Stepped params move at least one step per nudge so arrow keys never feel stuck.
    const steps = (spec.max - spec.min) / spec.step;
    if (Math.abs(deltaNorm) * steps < 1 && deltaNorm !== 0) {
      return fromNormalized(spec, toNormalized(spec, v + Math.sign(deltaNorm) * spec.step));
    }
  }
  return fromNormalized(spec, toNormalized(spec, v) + deltaNorm);
}

export interface ParamGroup {
  name: string;
  keys: string[];
}

/** Group a schema's keys by `spec.group`, in first-seen order; ungrouped params come first. */
export function groupSchema(schema: ParamSchema, exclude: readonly string[] = []): ParamGroup[] {
  const groups = new Map<string, string[]>();
  for (const [key, spec] of Object.entries(schema) as [string, ParamSpec][]) {
    if (exclude.includes(key)) continue;
    const name = spec.group ?? '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(key);
  }
  const out = [...groups].map(([name, keys]) => ({ name, keys }));
  return out.sort((a, b) => (a.name === '' ? -1 : b.name === '' ? 1 : 0));
}

/** Number of bars in the waveform overview. */
export const WAVE_BARS = 96;

/** Peak per bar over every channel of a rendered sound. */
export function waveformBars(channels: Float32Array[], count = WAVE_BARS): number[] {
  const length = channels[0]?.length ?? 0;
  const bars = new Array<number>(count).fill(0);
  if (!length) return bars;
  for (let b = 0; b < count; b++) {
    const from = Math.floor((b / count) * length);
    const to = Math.max(from + 1, Math.floor(((b + 1) / count) * length));
    let pk = 0;
    for (const ch of channels)
      for (let i = from; i < to && i < length; i++) pk = Math.max(pk, Math.abs(ch[i]!));
    bars[b] = pk;
  }
  const max = Math.max(...bars);
  return max > 0 ? bars.map((v) => v / max) : bars;
}
