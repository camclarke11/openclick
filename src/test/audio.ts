// Test helpers for rendering real audio in Node via node-web-audio-api. Shared by all workstreams.
import { OfflineAudioContext as NodeOfflineAudioContext } from 'node-web-audio-api';
import { createMemoryAssetStore, renderPatch, type Patch, type RenderOptions, type Registry } from '../core';

export const createTestContext = (
  channels: number,
  length: number,
  sampleRate: number,
): OfflineAudioContext =>
  new NodeOfflineAudioContext({
    numberOfChannels: channels,
    length,
    sampleRate,
  }) as unknown as OfflineAudioContext;

export function renderForTest(registry: Registry, patch: Patch, opts: Partial<RenderOptions> = {}) {
  return renderPatch(patch, {
    registry,
    assets: createMemoryAssetStore(),
    sampleRate: 48000,
    maxSeconds: 2,
    createContext: createTestContext,
    ...opts,
  });
}
