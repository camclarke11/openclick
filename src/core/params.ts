import type { Rng } from './rng';

/**
 * Declarative parameter schema. Every module (sources, effects, arpeggiator) describes its
 * parameters with this, which gives us defaults, validation, randomise and auto-generated UI
 * from one definition.
 */
export type ParamValue = number | boolean | string | number[];
export type Params = Record<string, ParamValue>;

interface ParamBase {
  label: string;
  /** Panel section the UI groups this control under. */
  group?: string;
  /** Excluded from one-click randomise when false (e.g. output gain). Default true. */
  randomize?: boolean;
  /** Short help text for tooltips. */
  hint?: string;
}

export interface NumberParam extends ParamBase {
  kind: 'number';
  min: number;
  max: number;
  default: number;
  step?: number;
  /** 'log' for frequencies and times, so knobs and randomise feel even across the range. */
  curve?: 'lin' | 'log';
  unit?: 'Hz' | 's' | 'ms' | 'dB' | '%' | 'st' | 'ct' | 'x';
  /** Restrict randomise to a narrower range than min..max. */
  randomRange?: [number, number];
}

export interface EnumParam extends ParamBase {
  kind: 'enum';
  options: readonly string[];
  default: string;
}

export interface BoolParam extends ParamBase {
  kind: 'bool';
  default: boolean;
}

/** Fixed-length lane of numbers, for step sequencers and arpeggiator lanes. */
export interface StepsParam extends ParamBase {
  kind: 'steps';
  length: number;
  min: number;
  max: number;
  default: number[];
  step?: number;
}

export type ParamSpec = NumberParam | EnumParam | BoolParam | StepsParam;
export type ParamSchema = Record<string, ParamSpec>;

export function defaultParams(schema: ParamSchema): Params {
  const out: Params = {};
  for (const [key, spec] of Object.entries(schema)) {
    out[key] = spec.kind === 'steps' ? [...spec.default] : spec.default;
  }
  return out;
}

function clampNum(v: number, min: number, max: number, step?: number): number {
  let x = Math.min(max, Math.max(min, v));
  if (step) x = Math.round((x - min) / step) * step + min;
  return Math.min(max, x);
}

/** Coerce one value into its spec, falling back to the default when the type is wrong. */
export function sanitizeParam(spec: ParamSpec, value: unknown): ParamValue {
  switch (spec.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? clampNum(value, spec.min, spec.max, spec.step)
        : spec.default;
    case 'enum':
      return typeof value === 'string' && spec.options.includes(value) ? value : spec.default;
    case 'bool':
      return typeof value === 'boolean' ? value : spec.default;
    case 'steps': {
      const src = Array.isArray(value) ? value : spec.default;
      return Array.from({ length: spec.length }, (_, i) => {
        const v = src[i];
        return typeof v === 'number' && Number.isFinite(v)
          ? clampNum(v, spec.min, spec.max, spec.step)
          : (spec.default[i] ?? spec.min);
      });
    }
  }
}

/** Fill missing keys with defaults, drop unknown keys, clamp everything into range. */
export function sanitizeParams(schema: ParamSchema, input: unknown): Params {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Params = {};
  for (const [key, spec] of Object.entries(schema)) out[key] = sanitizeParam(spec, src[key]);
  return out;
}

function randomNumber(rng: Rng, min: number, max: number, curve: 'lin' | 'log' = 'lin'): number {
  if (curve === 'log' && min > 0) return Math.exp(rng.range(Math.log(min), Math.log(max)));
  return rng.range(min, max);
}

/**
 * Randomise every param whose spec allows it. `amount` (0..1) blends from the current value
 * toward a fresh random one so the UI can offer gentle "mutate" as well as full randomise.
 */
export function randomizeParams(schema: ParamSchema, current: Params, rng: Rng, amount = 1): Params {
  const out: Params = { ...current };
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.randomize === false) continue;
    const cur = current[key];
    switch (spec.kind) {
      case 'number': {
        const [lo, hi] = spec.randomRange ?? [spec.min, spec.max];
        const r = randomNumber(rng, lo, hi, spec.curve);
        const base = typeof cur === 'number' ? cur : spec.default;
        out[key] = sanitizeParam(spec, base + (r - base) * amount);
        break;
      }
      case 'enum':
        if (rng.next() < amount) out[key] = rng.pick(spec.options);
        break;
      case 'bool':
        if (rng.next() < amount) out[key] = rng.next() < 0.5;
        break;
      case 'steps': {
        const base = Array.isArray(cur) ? cur : spec.default;
        out[key] = sanitizeParam(
          spec,
          Array.from({ length: spec.length }, (_, i) => {
            const b = base[i] ?? spec.min;
            return b + (rng.range(spec.min, spec.max) - b) * amount;
          }),
        );
        break;
      }
    }
  }
  return out;
}

/** Map a normalised 0..1 control position to a value, honouring the curve. For knobs/sliders. */
export function fromNormalized(spec: NumberParam, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const v =
    spec.curve === 'log' && spec.min > 0
      ? Math.exp(Math.log(spec.min) + u * (Math.log(spec.max) - Math.log(spec.min)))
      : spec.min + u * (spec.max - spec.min);
  return sanitizeParam(spec, v) as number;
}

export function toNormalized(spec: NumberParam, v: number): number {
  if (spec.curve === 'log' && spec.min > 0) {
    return (Math.log(v) - Math.log(spec.min)) / (Math.log(spec.max) - Math.log(spec.min));
  }
  return (v - spec.min) / (spec.max - spec.min);
}

/** Typed reads for module code: `num(p, 'freq')` instead of casting everywhere. */
export const num = (p: Params, k: string): number => p[k] as number;
export const str = (p: Params, k: string): string => p[k] as string;
export const bool = (p: Params, k: string): boolean => p[k] as boolean;
export const steps = (p: Params, k: string): number[] => p[k] as number[];
