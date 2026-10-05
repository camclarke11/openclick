import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from './wav';
import { createZip, crc32, readZip } from './zip';
import { normalize, toMono } from './process';
import { peak } from '../core';

const sine = (n: number, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 7));

describe('encodeWav', () => {
  it.each([16, 24, '32f'] as const)('round-trips %s-bit stereo', (bitDepth) => {
    const audio = { sampleRate: 44100, channels: [sine(500), sine(500, -0.25)] };
    const bytes = encodeWav(audio, { bitDepth });
    const back = decodeWav(bytes);
    expect(back.sampleRate).toBe(44100);
    expect(back.bitDepth).toBe(bitDepth);
    expect(back.channels).toHaveLength(2);
    const tol = bitDepth === 16 ? 1 / 30000 : bitDepth === 24 ? 1 / 8e6 : 1e-7;
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < 500; i++)
        expect(Math.abs(back.channels[c]![i]! - audio.channels[c]![i]!)).toBeLessThan(tol);
    }
  });

  it('writes a valid 16-bit PCM header', () => {
    const bytes = encodeWav({ sampleRate: 48000, channels: [new Float32Array(10)] });
    const v = new DataView(bytes.buffer);
    const ascii = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
    expect(ascii(0)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(bytes.length - 8);
    expect(ascii(8)).toBe('WAVE');
    expect(ascii(12)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(96000); // byte rate
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(36)).toBe('data');
    expect(v.getUint32(40, true)).toBe(20);
    expect(bytes.length).toBe(64);
  });

  it('clamps integer samples instead of wrapping', () => {
    const back = decodeWav(encodeWav({ sampleRate: 8000, channels: [Float32Array.from([2, -2])] }));
    expect(back.channels[0]![0]).toBeCloseTo(1, 3);
    expect(back.channels[0]![1]).toBe(-1);
  });
});

describe('process', () => {
  it('normalises to the target peak and leaves silence alone', () => {
    const out = normalize({ sampleRate: 1, channels: [sine(100, 0.1)] }, -6);
    expect(peak(out)).toBeCloseTo(Math.pow(10, -6 / 20), 5);
    const silent = { sampleRate: 1, channels: [new Float32Array(4)] };
    expect(normalize(silent)).toBe(silent);
  });

  it('downmixes to mono', () => {
    const out = toMono({ sampleRate: 1, channels: [Float32Array.from([1, 0]), Float32Array.from([0, 1])] });
    expect(Array.from(out.channels[0]!)).toEqual([0.5, 0.5]);
  });
});

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips stored entries', () => {
    const files = [
      { name: 'a.wav', data: Uint8Array.from([1, 2, 3]) },
      { name: 'b.wav', data: new Uint8Array(1000).fill(7) },
    ];
    const zip = createZip(files);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(zip.length - 12, true)).toBe(2);
    expect(readZip(zip)).toEqual(files);
  });
});
