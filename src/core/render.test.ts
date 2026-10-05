import { describe, expect, it } from 'vitest';
import { registry } from '../modules';
import { renderForTest } from '../test/audio';
import { createRegistry, defaultParams, defaultPatch, peak, trimSilence, type EffectModule } from './index';

describe('renderPatch', () => {
  it('renders the default sine blip offline and trims the tail', async () => {
    const audio = await renderForTest(registry, defaultPatch(registry));
    expect(audio.channels).toHaveLength(2);
    expect(peak(audio)).toBeGreaterThan(0.1);
    expect(peak(audio)).toBeLessThanOrEqual(1);
    // 0.002 attack + 0.15 decay: well under the 2 s render window once trimmed.
    expect(audio.channels[0]!.length / audio.sampleRate).toBeLessThan(0.3);
  });

  it('is reproducible with a fixed seed', async () => {
    const p = defaultPatch(registry, 'click');
    const a = await renderForTest(registry, p, { seed: 7 });
    const b = await renderForTest(registry, p, { seed: 7 });
    expect(Array.from(a.channels[0]!)).toEqual(Array.from(b.channels[0]!));
  });

  it('stacks layers and routes through the fx chain', async () => {
    const gain: EffectModule = {
      type: 'gain',
      label: 'Gain',
      schema: { amount: { kind: 'number', label: 'Amount', min: 0, max: 1, default: 0 } },
      tail: () => 0,
      create(ctx, params) {
        const g = ctx.createGain();
        g.gain.value = params.amount as number;
        return {
          input: g,
          output: g,
          update: (p) => void (g.gain.value = p.amount as number),
          dispose: () => g.disconnect(),
        };
      },
    };
    const reg = createRegistry({
      sources: [...registry.sources.values()],
      effects: [gain],
      arp: registry.arp,
    });
    const p = defaultPatch(reg);
    p.layers.push({ ...p.layers[0]! });
    const two = await renderForTest(reg, p);
    expect(peak(two)).toBeGreaterThan(0.1);
    const muted = await renderForTest(reg, {
      ...p,
      fx: [{ type: 'gain', enabled: true, params: defaultParams(gain.schema) }],
    });
    expect(peak(muted)).toBe(0);
  });
});

describe('trimSilence', () => {
  it('keeps everything up to the last audible sample', () => {
    const ch = new Float32Array(1000);
    ch[499] = 0.5;
    const out = trimSilence({ sampleRate: 1000, channels: [ch] });
    expect(out.channels[0]!.length).toBe(505);
  });
});
