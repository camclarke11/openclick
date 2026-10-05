import { describe, expect, it } from 'vitest';
import {
  createRegistry,
  createRng,
  defaultParams,
  defaultPatch,
  peak,
  type NoteEvent,
  type Params,
} from '../core';
import { registry } from '../modules';
import { renderForTest } from '../test/audio';
import { arp, arpSchema, lanePosition, MAX_STEPS, stepSeconds } from './index';

const base: NoteEvent = { note: 60, velocity: 1, time: 1, gate: 0.25, pan: 0 };
const fill = (v: number[]) => Array.from({ length: MAX_STEPS }, (_, i) => v[i] ?? v[v.length - 1]!);

function params(over: Partial<Params> = {}): Params {
  return {
    ...defaultParams(arpSchema),
    enabled: true,
    rateMode: 'ms',
    rateMs: 100,
    pitch: fill([0]),
    velocity: fill([1]),
    pan: fill([0]),
    repeats: fill([1]),
    gate: fill([0.5]),
    ...over,
  };
}

const expand = (over: Partial<Params> = {}, seed = 1) => arp.expand(params(over), base, createRng(seed));

describe('arp', () => {
  it('keeps the enabled param, off by default', () => {
    expect(arpSchema.enabled.default).toBe(false);
  });

  it('maps lane values onto events', () => {
    const evs = expand({
      steps: 4,
      pitchLength: 4,
      pitch: fill([0, 3, 7, 12]),
      velocity: fill([1, 0.5, 0.25, 0.8]),
      pan: fill([-1, 1, 0, 0.5]),
      gate: fill([0.5, 1, 0.25, 0.1]),
    });
    expect(evs.map((e) => e.note)).toEqual([60, 63, 67, 72]);
    expect(evs.map((e) => e.velocity)).toEqual([1, 0.5, 0.25, 0.8]);
    expect(evs.map((e) => e.pan)).toEqual([-1, 1, 0, 0.5]);
    expect(evs.map((e) => e.time)).toEqual([1, 1.1, 1.2, 1.3].map((t) => expect.closeTo(t, 9)));
    expect(evs.map((e) => e.gate)).toEqual([0.05, 0.1, 0.025, 0.01].map((g) => expect.closeTo(g, 9)));
  });

  it('scales by the played velocity and offsets the played pan, clamped', () => {
    const evs = arp.expand(
      params({ steps: 1, pan: fill([0.8]) }),
      { ...base, velocity: 0.5, pan: 0.5 },
      createRng(1),
    );
    expect(evs[0]).toMatchObject({ velocity: 0.5, pan: 1 });
  });

  it('treats zero velocity as a rest', () => {
    const evs = expand({ steps: 4, velocity: fill([1, 0, 1, 0]) });
    expect(evs.map((e) => e.time)).toEqual([1, expect.closeTo(1.2, 9)]);
  });

  it('wraps lanes at the pitch length when polymeter is off', () => {
    const evs = expand({
      steps: 6,
      pitchLength: 2,
      velocityLength: 3,
      pitch: fill([0, 12]),
      velocity: fill([1, 0.5, 0.25]),
    });
    expect(evs.map((e) => e.note)).toEqual([60, 72, 60, 72, 60, 72]);
    expect(evs.map((e) => e.velocity)).toEqual([1, 0.5, 1, 0.5, 1, 0.5]);
  });

  it('wraps each lane at its own length in polymeter mode', () => {
    const evs = expand({
      steps: 6,
      polymeter: true,
      pitchLength: 2,
      velocityLength: 3,
      pitch: fill([0, 12]),
      velocity: fill([1, 0.5, 0.25]),
    });
    expect(evs.map((e) => e.note)).toEqual([60, 72, 60, 72, 60, 72]);
    expect(evs.map((e) => e.velocity)).toEqual([1, 0.5, 0.25, 1, 0.5, 0.25]);
  });

  it('subdivides a step into repeats', () => {
    const evs = expand({ steps: 2, repeats: fill([3, 1]), gate: fill([1]) });
    expect(evs).toHaveLength(4);
    expect(evs.map((e) => e.time)).toEqual(
      [1, 1 + 0.1 / 3, 1 + 0.2 / 3, 1.1].map((t) => expect.closeTo(t, 9)),
    );
    expect(evs[0]!.gate).toBeCloseTo(0.1 / 3, 9);
    expect(evs[3]!.gate).toBeCloseTo(0.1, 9);
  });

  it('orders directions correctly', () => {
    const notes = (direction: string, n = 8) =>
      expand({ steps: n, direction, pitchLength: 4, pitch: fill([0, 1, 2, 3]) }).map((e) => e.note - 60);
    expect(notes('forward')).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(notes('reverse')).toEqual([3, 2, 1, 0, 3, 2, 1, 0]);
    expect(notes('ping-pong')).toEqual([0, 1, 2, 3, 2, 1, 0, 1]);
    const rnd = notes('random', 32);
    expect(rnd).toHaveLength(32);
    expect(new Set(rnd).size).toBeGreaterThan(1);
    for (const n of rnd) expect([0, 1, 2, 3]).toContain(n);
    expect(lanePosition('ping-pong', 5, 1)).toBe(0);
  });

  it('is deterministic with a seed', () => {
    const p = { steps: 16, direction: 'random', pitch: fill([0, 1, 2, 3]) };
    expect(expand(p, 9)).toEqual(expand(p, 9));
    expect(expand(p, 9)).not.toEqual(expand(p, 10));
  });

  it('applies swing to every second step', () => {
    const evs = expand({ steps: 4, swing: 100 });
    expect(evs.map((e) => e.time)).toEqual(
      [1, 1.1 + 0.1 / 3, 1.2, 1.3 + 0.1 / 3].map((t) => expect.closeTo(t, 9)),
    );
  });

  it('derives step time from tempo and division in sync mode', () => {
    expect(stepSeconds(params({ rateMode: 'sync', tempo: 120, division: '1/16' }))).toBeCloseTo(0.125, 9);
    expect(stepSeconds(params({ rateMode: 'sync', tempo: 120, division: '1/8T' }))).toBeCloseTo(1 / 6, 9);
    expect(stepSeconds(params({ rateMode: 'ms', rateMs: 40 }))).toBeCloseTo(0.04, 9);
  });

  it('expands default params into a sensible rising pattern', () => {
    const evs = arp.expand({ ...defaultParams(arpSchema), enabled: true }, base, createRng(1));
    expect(evs).toHaveLength(8);
    expect(evs.slice(0, 4).map((e) => e.note)).toEqual([60, 64, 67, 72]);
  });

  it('stacks layers with transpose and delay over the expanded events', async () => {
    const reg = createRegistry({ sources: [...registry.sources.values()], effects: [], arp });
    const patch = defaultPatch(reg);
    patch.arp = params({ steps: 4, rateMs: 100 });
    const one = await renderForTest(reg, patch);
    patch.layers.push({ ...patch.layers[0]!, mix: { ...patch.layers[0]!.mix, transpose: 12, delay: 50 } });
    const two = await renderForTest(reg, patch);
    const secs = (a: typeof one) => a.channels[0]!.length / a.sampleRate;
    expect(peak(one)).toBeGreaterThan(0.05);
    expect(peak(two)).toBeLessThanOrEqual(1);
    // Four 100 ms steps: the sound lasts past the third step, and the delayed layer extends it.
    expect(secs(one)).toBeGreaterThan(0.3);
    expect(secs(two)).toBeGreaterThan(secs(one) + 0.03);
  });
});
