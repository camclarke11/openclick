const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/**
 * Add an AudioWorklet module to a context once. In module code, get the URL with Vite's
 * `import url from './my-processor.ts?worker&url'` so it is bundled for production.
 */
export function loadWorklet(ctx: BaseAudioContext, url: string): Promise<void> {
  let map = loaded.get(ctx);
  if (!map) loaded.set(ctx, (map = new Map()));
  let job = map.get(url);
  if (!job) {
    job = ctx.audioWorklet.addModule(url);
    map.set(url, job);
  }
  return job;
}
