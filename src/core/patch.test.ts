import { describe, expect, it } from 'vitest';
import { registry } from '../modules';
import { defaultPatch, MAX_LAYERS, parsePreset, PRESET_FORMAT, sanitizePatch } from './patch';

describe('patch', () => {
  it('round-trips the default patch through JSON', () => {
    const p = defaultPatch(registry);
    expect(sanitizePatch(registry, JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('drops unknown sources and effects and caps layers', () => {
    const p = defaultPatch(registry);
    const layer = p.layers[0]!;
    const input = {
      ...p,
      layers: [{ ...layer, source: 'nope' }, ...Array.from({ length: 6 }, () => layer)],
      fx: [{ type: 'nope', enabled: true, params: {} }],
    };
    const out = sanitizePatch(registry, input);
    expect(out.layers).toHaveLength(MAX_LAYERS);
    expect(out.fx).toHaveLength(0);
  });

  it('falls back to a default patch for garbage', () => {
    expect(sanitizePatch(registry, null)).toEqual(defaultPatch(registry));
  });

  it('parses presets and rejects other JSON', () => {
    const preset = parsePreset(registry, {
      format: PRESET_FORMAT,
      version: 1,
      id: 'x',
      name: 'Blip',
      category: 'UI/Click',
      tags: ['short'],
      patch: defaultPatch(registry),
    });
    expect(preset.name).toBe('Blip');
    expect(() => parsePreset(registry, { name: 'x' })).toThrow();
  });
});
