import { describe, expect, it } from 'vitest';
import {
  createRng,
  defaultParams,
  defaultPatch,
  peak,
  randomizeParams,
  type EffectModule,
  type Params,
} from '../core';
import { registry } from '../modules';
import { createTestContext, renderForTest } from '../test/audio';
import { bitcrusher, chorus, delay, dispersion, effects, eq, granulizer, reverb } from './index';
import { diffRms, isFinite32, peakOf, renderEffect, rms, SR, testSignal } from './test-utils';

const INPUT_SECONDS = 0.06;
const defaults = (m: EffectModule) => defaultParams(m.schema);
const withParams = (m: EffectModule, p: Params) => ({ ...defaults(m), ...p });

/** Native-node effects render fully in Node; params here make each one clearly audible. */
const native: { mod: EffectModule; audible: Params }[] = [
  { mod: eq, audible: { lowGain: 12, highCut: 1500 } },
  { mod: delay, audible: { mix: 1 } },
  { mod: reverb, audible: { mix: 1 } },
  { mod: chorus, audible: { mix: 1 } },
  { mod: dispersion, audible: { mix: 1, stages: 48, frequency: 300 } },
];

/** Render long enough to hear the whole reported tail plus some margin. */
const seconds = (m: EffectModule, p: Params) => INPUT_SECONDS + m.tail(p) + 0.25;

describe('effects catalogue', () => {
  it('lists all seven effects in menu order with unique types', () => {
    expect(effects.map((e) => e.type)).toEqual([
      'eq',
      'delay',
      'reverb',
      'chorus',
      'dispersion',
      'granulizer',
      'bitcrusher',
    ]);
  });

  it.each(effects.map((m) => [m.type, m] as const))('%s has a mix param and a sane tail', (_, m) => {
    expect(m.schema.mix?.kind).toBe('number');
    const t = m.tail(defaults(m));
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(15);
  });
});

describe.each(native.map((n) => [n.mod.type, n] as const))('%s', (_, { mod, audible }) => {
  it('passes the input untouched at mix 0', async () => {
    const input = testSignal();
    const out = await renderEffect(mod, withParams(mod, { ...audible, mix: 0 }), { input });
    expect(diffRms(out.left.subarray(0, input.length), input)).toBeLessThan(1e-4);
    expect(rms(out.left, input.length + 10)).toBeLessThan(1e-4);
  });

  it('changes the sound at full mix', async () => {
    const input = testSignal();
    const p = withParams(mod, audible);
    const out = await renderEffect(mod, p, { input, seconds: seconds(mod, p) });
    const padded = new Float32Array(out.left.length);
    padded.set(input);
    expect(diffRms(out.left, padded)).toBeGreaterThan(0.02);
  });

  it('renders defaults without NaNs or clipping', async () => {
    const p = defaults(mod);
    const out = await renderEffect(mod, p, { seconds: seconds(mod, p) });
    expect(isFinite32(out.left) && isFinite32(out.right)).toBe(true);
    expect(peakOf(out.left, out.right)).toBeGreaterThan(0.05);
    expect(peakOf(out.left, out.right)).toBeLessThanOrEqual(1);
  });

  it('falls silent within the reported tail', async () => {
    for (const p of [defaults(mod), withParams(mod, audible)]) {
      const out = await renderEffect(mod, p, { seconds: seconds(mod, p) });
      const after = Math.ceil((INPUT_SECONDS + mod.tail(p)) * SR);
      // -60 dB below the 0.8 peak input.
      expect(peakOf(out.left.subarray(after), out.right.subarray(after))).toBeLessThan(0.8e-3);
    }
  });

  it('applies updates without rebuilding or glitching', async () => {
    const p = defaults(mod);
    const base = await renderEffect(mod, p);
    const same = await renderEffect(mod, p, { update: { ...p } });
    expect(diffRms(base.left, same.left)).toBeLessThan(1e-5);
    const changed = await renderEffect(mod, p, { update: withParams(mod, audible) });
    expect(isFinite32(changed.left)).toBe(true);
    expect(diffRms(base.left, changed.left)).toBeGreaterThan(1e-3);
  });

  it('is deterministic for a seed', async () => {
    const p = defaults(mod);
    const a = await renderEffect(mod, p, { seed: 3 });
    const b = await renderEffect(mod, p, { seed: 3 });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
  });

  it('stays finite and bounded under randomise', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = randomizeParams(mod.schema, defaults(mod), createRng(seed));
      const out = await renderEffect(mod, p, { seconds: 0.4 });
      expect(isFinite32(out.left) && isFinite32(out.right)).toBe(true);
      expect(peakOf(out.left, out.right)).toBeLessThan(4);
    }
  });
});

describe.each([granulizer, bitcrusher].map((m) => [m.type, m] as const))('%s (worklet)', (_, mod) => {
  it('is a clean passthrough at mix 0', async () => {
    const input = testSignal();
    const out = await renderEffect(mod, withParams(mod, { mix: 0 }), { input });
    expect(diffRms(out.left.subarray(0, input.length), input)).toBeLessThan(1e-4);
  });

  it('degrades to a passthrough where worklets cannot load (Node)', async () => {
    // prepare must never reject, or the whole patch would fail to render.
    await mod.prepare?.(createTestContext(2, 128, SR));
    const input = testSignal();
    const out = await renderEffect(mod, defaults(mod), { input, update: withParams(mod, { mix: 1 }) });
    expect(isFinite32(out.left)).toBe(true);
    expect(peakOf(out.left)).toBeGreaterThan(0.1);
  });
});

describe('full chain', () => {
  it('renders a patch through every effect with default settings', async () => {
    const patch = defaultPatch(registry);
    patch.fx = effects.map((m) => ({ type: m.type, enabled: true, params: defaults(m) }));
    const audio = await renderForTest(registry, patch, { maxSeconds: 3 });
    for (const ch of audio.channels) expect(isFinite32(ch)).toBe(true);
    expect(peak(audio)).toBeGreaterThan(0.05);
    expect(peak(audio)).toBeLessThanOrEqual(1);
  });
});
