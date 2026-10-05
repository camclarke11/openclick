import type { AssetStore } from './types';

/**
 * Fetch-and-decode store. Decoded AudioBuffers are plain data, so one store serves the live
 * context and offline export contexts alike.
 */
export function createAssetStore(resolveUrl: (id: string) => string): AssetStore {
  const buffers = new Map<string, AudioBuffer>();
  const pending = new Map<string, Promise<void>>();
  return {
    get: (id) => buffers.get(id),
    async load(ids, ctx) {
      await Promise.all(
        ids.map((id) => {
          if (buffers.has(id)) return Promise.resolve();
          let job = pending.get(id);
          if (!job) {
            job = fetch(resolveUrl(id))
              .then((r) => {
                if (!r.ok) throw new Error(`Failed to load sample ${id}: ${r.status}`);
                return r.arrayBuffer();
              })
              .then((data) => ctx.decodeAudioData(data))
              .then((buf) => void buffers.set(id, buf))
              .finally(() => pending.delete(id));
            pending.set(id, job);
          }
          return job;
        }),
      );
    },
  };
}

/** In-memory store for tests and synthesized placeholder samples. */
export function createMemoryAssetStore(initial: Record<string, AudioBuffer> = {}): AssetStore & {
  set(id: string, buf: AudioBuffer): void;
} {
  const buffers = new Map(Object.entries(initial));
  return {
    get: (id) => buffers.get(id),
    load: async () => {},
    set: (id, buf) => void buffers.set(id, buf),
  };
}
