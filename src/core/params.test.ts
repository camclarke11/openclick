import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  fromNormalized,
  randomizeParams,
  sanitizeParams,
  toNormalized,
  type NumberParam,
  type ParamSchema,
} from './params';
import { createRng } from './rng';

const schema = {
  freq: { kind: 'number', label: 'Freq', min: 20, max: 20000, default: 440, curve: 'log' },
  steps: { kind: 'number', label: 'Steps', min: 0, max: 10, default: 2, step: 1 },
  locked: { kind: 'number', label: 'Out', min: -60, max: 0, default: -6, randomize: false },
  wave: { kind: 'enum', label: 'Wave', options: ['a', 'b', 'c'], default: 'a' },
  on: { kind: 'bool', label: 'On', default: true },
  lane: { kind: 'steps', label: 'Lane', length: 4, min: -12, max: 12, default: [0, 0, 0, 0], step: 1 },
} satisfies ParamSchema;

describe('params', () => {
  it('builds defaults', () => {
    expect(defaultParams(schema)).toEqual({
      freq: 440,
      steps: 2,
      locked: -6,
      wave: 'a',
      on: true,
      lane: [0, 0, 0, 0],
    });
  });

  it('sanitizes bad input', () => {
    const p = sanitizeParams(schema, {
      freq: 1e9,
      steps: 3.4,
      wave: 'zzz',
      on: 'yes',
      lane: [100, 'x'],
      extra: 1,
    });
    expect(p).toEqual({ freq: 20000, steps: 3, locked: -6, wave: 'a', on: true, lane: [12, 0, 0, 0] });
  });

  it('randomizes within range, deterministically, and respects randomize:false', () => {
    const base = defaultParams(schema);
    const a = randomizeParams(schema, base, createRng(42));
    const b = randomizeParams(schema, base, createRng(42));
    expect(a).toEqual(b);
    expect(a.locked).toBe(-6);
    expect(sanitizeParams(schema, a)).toEqual(a);
    for (let s = 0; s < 50; s++) {
      const r = randomizeParams(schema, base, createRng(s));
      expect(r.freq).toBeGreaterThanOrEqual(20);
      expect(r.freq).toBeLessThanOrEqual(20000);
      expect(Number.isInteger(r.steps)).toBe(true);
    }
  });

  it('amount 0 leaves values unchanged', () => {
    const base = defaultParams(schema);
    expect(randomizeParams(schema, base, createRng(1), 0)).toEqual(base);
  });

  it('maps normalized positions on a log curve', () => {
    const spec = schema.freq as NumberParam;
    expect(fromNormalized(spec, 0)).toBeCloseTo(20);
    expect(fromNormalized(spec, 1)).toBeCloseTo(20000);
    expect(toNormalized(spec, fromNormalized(spec, 0.37))).toBeCloseTo(0.37);
  });
});
