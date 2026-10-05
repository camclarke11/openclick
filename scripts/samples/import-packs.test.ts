import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeWav } from '../../src/export/wav';
import { generateLibrary } from './generate';
import {
  buildManifest,
  MAX_SECONDS,
  MAX_TAKES,
  PACKS,
  PEAK,
  prepareSample,
  SAMPLE_RATE,
} from './import-packs';

const root = new URL('../../', import.meta.url);
const committed = JSON.parse(readFileSync(new URL('src/engines/click/packs.json', root), 'utf8'));

describe('CC0 pack import', () => {
  it('matches the committed manifest (re-run the script after changing SELECTION)', () => {
    expect(committed).toEqual(buildManifest());
  });

  it('only imports CC0 packs, credited with a source URL', () => {
    for (const pack of Object.values(PACKS)) {
      expect(pack.license).toBe('CC0-1.0');
      expect(pack.url).toMatch(/^https:\/\//);
    }
    for (const s of committed.categories.flatMap((c: { sounds: unknown[] }) => c.sounds)) {
      expect(s.placeholder).toBe(false);
      expect(s.license).toBe('CC0-1.0');
      expect(s.source).toMatch(/^https:\/\//);
      expect(s.files.length).toBeGreaterThan(1);
      expect(s.files.length).toBeLessThanOrEqual(MAX_TAKES);
    }
  });

  it('does not collide with the placeholder library', () => {
    const placeholder = generateLibrary(1).manifest.categories;
    const ids = new Set(placeholder.map((c) => c.id));
    const names = new Set(placeholder.map((c) => c.name));
    for (const c of committed.categories) {
      expect(ids.has(c.id), c.id).toBe(false);
      expect(names.has(c.name), c.name).toBe(false);
    }
  });

  it('commits short, mono 48 kHz files at the library level, within a size budget', () => {
    let bytes = 0;
    for (const c of committed.categories) {
      for (const s of c.sounds) {
        for (const f of s.files) {
          const data = readFileSync(new URL(`public/samples/${f}`, root));
          bytes += statSync(new URL(`public/samples/${f}`, root)).size;
          const wav = decodeWav(data);
          expect(wav.sampleRate, f).toBe(SAMPLE_RATE);
          expect(wav.channels.length, f).toBe(1);
          const ch = wav.channels[0]!;
          expect(ch.length / SAMPLE_RATE, f).toBeLessThanOrEqual(MAX_SECONDS + 0.001);
          let p = 0;
          for (const v of ch) p = Math.max(p, Math.abs(v));
          expect(p, f).toBeGreaterThan(PEAK - 0.01);
          expect(p, f).toBeLessThan(PEAK + 0.01);
        }
      }
    }
    expect(bytes).toBeLessThan(24 * 1024 * 1024);
  });
});

describe('prepareSample', () => {
  it('trims leading and trailing silence, normalises and caps the length', () => {
    const input = new Float32Array(SAMPLE_RATE * 5);
    input.fill(0.25, SAMPLE_RATE, SAMPLE_RATE * 4.5);
    const out = prepareSample(input);
    expect(out.length).toBe(MAX_SECONDS * SAMPLE_RATE);
    expect(Math.max(...out.subarray(0, SAMPLE_RATE))).toBeCloseTo(PEAK, 5);
    expect(out[out.length - 1]).toBeCloseTo(0, 3);

    const short = new Float32Array(SAMPLE_RATE);
    short.fill(0.5, 1000, 2000);
    const trimmed = prepareSample(short);
    expect(trimmed.length).toBeLessThan(2000);
  });

  it('rejects silence', () => {
    expect(() => prepareSample(new Float32Array(100))).toThrow();
  });
});
