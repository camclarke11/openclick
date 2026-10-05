// Test-only: an asset store holding the real sample library (placeholders and CC0 packs) from public/samples,
// decoded in Node, so Click layers render actual audio in preset and recipe tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AudioBuffer as NodeAudioBuffer } from 'node-web-audio-api';
import { createMemoryAssetStore, type AssetStore } from '../core';
import { decodeWav } from '../export/wav';
import manifest from '../engines/click/manifest.json';
import packs from '../engines/click/packs.json';

let store: AssetStore | null = null;

export function sampleAssets(): AssetStore {
  if (store) return store;
  const mem = createMemoryAssetStore();
  const root = fileURLToPath(new URL('../../public/samples/', import.meta.url));
  for (const cat of [...manifest.categories, ...packs.categories]) {
    for (const sound of cat.sounds) {
      for (const file of sound.files) {
        const wav = decodeWav(readFileSync(root + file));
        const buf = new NodeAudioBuffer({
          length: wav.channels[0]!.length,
          sampleRate: wav.sampleRate,
          numberOfChannels: wav.channels.length,
        }) as unknown as AudioBuffer;
        wav.channels.forEach((ch, i) => buf.copyToChannel(new Float32Array(ch), i));
        mem.set(file, buf);
      }
    }
  }
  return (store = mem);
}
