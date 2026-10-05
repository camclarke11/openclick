import { describe, expect, it } from 'vitest';
import type { NumberParam, ParamSchema } from '../core';
import { formatValue, groupSchema, nudge } from './controls';

const num = (o: Partial<NumberParam>): NumberParam => ({
  kind: 'number',
  label: 'X',
  min: 0,
  max: 1,
  default: 0,
  ...o,
});

describe('formatValue', () => {
  it('formats common units', () => {
    expect(formatValue(num({ min: 20, max: 20000, unit: 'Hz' }), 1200)).toBe('1.20 kHz');
    expect(formatValue(num({ min: 20, max: 20000, unit: 'Hz' }), 440)).toBe('440 Hz');
    expect(formatValue(num({ max: 2, unit: 's' }), 0.035)).toBe('35 ms');
    expect(formatValue(num({ max: 2, unit: 's' }), 1.5)).toBe('1.50 s');
    expect(formatValue(num({ max: 500, unit: 'ms' }), 0)).toBe('0.0 ms');
    expect(formatValue(num({ max: 2000, unit: 'ms' }), 1500)).toBe('1.50 s');
    expect(formatValue(num({ min: -60, max: 6, unit: 'dB' }), -60)).toBe('-inf dB');
    expect(formatValue(num({ min: -60, max: 6, unit: 'dB' }), 3)).toBe('+3.0 dB');
    expect(formatValue(num({ min: -24, max: 24, step: 1, unit: 'st' }), 7)).toBe('+7 st');
    expect(formatValue(num({ label: 'Pan', min: -1, max: 1 }), -0.4)).toBe('L 40');
    expect(formatValue(num({ label: 'Pan', min: -1, max: 1 }), 0)).toBe('C');
  });
});

describe('nudge', () => {
  it('moves through the range and clamps', () => {
    expect(nudge(num({}), 0.5, 0.1)).toBeCloseTo(0.6);
    expect(nudge(num({}), 0.95, 0.1)).toBe(1);
    expect(nudge(num({}), 0.05, -0.1)).toBe(0);
  });

  it('follows log curves', () => {
    const spec = num({ min: 10, max: 1000, curve: 'log' });
    expect(nudge(spec, 100, 0.5)).toBeCloseTo(1000);
  });

  it('always moves a stepped param by at least one step', () => {
    const spec = num({ min: -24, max: 24, step: 1 });
    expect(nudge(spec, 0, 0.001)).toBe(1);
    expect(nudge(spec, 0, -0.001)).toBe(-1);
  });
});

describe('groupSchema', () => {
  it('groups by spec.group with ungrouped first and honours exclusions', () => {
    const schema: ParamSchema = {
      enabled: { kind: 'bool', label: 'On', default: true },
      a: { kind: 'number', label: 'A', group: 'Osc', min: 0, max: 1, default: 0 },
      b: { kind: 'number', label: 'B', group: 'Amp', min: 0, max: 1, default: 0 },
      c: { kind: 'number', label: 'C', group: 'Osc', min: 0, max: 1, default: 0 },
      d: { kind: 'number', label: 'D', min: 0, max: 1, default: 0 },
    };
    expect(groupSchema(schema, ['enabled'])).toEqual([
      { name: '', keys: ['d'] },
      { name: 'Osc', keys: ['a', 'c'] },
      { name: 'Amp', keys: ['b'] },
    ]);
  });
});
