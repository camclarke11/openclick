import { createRng, SoundGraph, type Patch } from '../core';
import { registry } from '../modules';
import { assets, engine } from '../state/store';

let graph: SoundGraph | null = null;
let graphCtx: BaseAudioContext | null = null;

/**
 * Play a patch without loading it, through a second graph on the engine's context. Returns
 * false if audio has not been started yet and `gesture` is false (hover cannot start audio;
 * browsers only allow that from a click or key press).
 */
export async function audition(patch: Patch, gesture: boolean, note = 60): Promise<boolean> {
  if (!engine.context) {
    if (!gesture) return false;
    await engine.start();
  }
  const ctx = engine.context;
  if (!ctx) return false;
  if (!graph || graphCtx !== ctx) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.connect(engine.analyser ?? ctx.destination);
    graph = new SoundGraph(ctx, limiter, { registry, assets, rng: createRng() });
    graphCtx = ctx;
  }
  await graph.prepare(patch);
  graph.panic();
  graph.setPatch(patch);
  graph.trigger(note, 0.9, ctx.currentTime + 0.01);
  return true;
}
