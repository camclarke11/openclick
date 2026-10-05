import type { BusEvents, EventBus } from './bus';
import { SoundGraph } from './graph';
import type { Patch } from './patch';
import { createRng } from './rng';
import type { AssetStore, Registry } from './types';

/** Scheduling headroom so notes start on time even if the main thread is busy. */
const LOOKAHEAD = 0.01;

/**
 * The realtime engine. Owns the AudioContext (created on the first user gesture, per browser
 * autoplay rules), listens to the note bus and plays the current patch.
 */
export class Engine {
  private ctx: AudioContext | null = null;
  private graph: SoundGraph | null = null;
  private patch: Patch | null = null;
  private _analyser: AnalyserNode | null = null;

  constructor(
    private readonly registry: Registry,
    private readonly assets: AssetStore,
  ) {}

  /** Wire to a bus. Returns an unsubscribe function. */
  connect(bus: EventBus<BusEvents>): () => void {
    const offs = [
      bus.on('noteOn', (m) => this.play(m.note, m.velocity)),
      bus.on('panic', () => this.graph?.panic()),
    ];
    return () => offs.forEach((off) => off());
  }

  /** Output tap for meters and scopes. Null until audio has started. */
  get analyser(): AnalyserNode | null {
    return this._analyser;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  setPatch(patch: Patch): void {
    this.patch = patch;
    if (this.graph) {
      this.graph.setPatch(patch);
      void this.graph.prepare(patch);
    }
  }

  /** Must be called from a user gesture the first time. */
  async start(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.05;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      limiter.connect(analyser).connect(ctx.destination);
      this.ctx = ctx;
      this._analyser = analyser;
      this.graph = new SoundGraph(ctx, limiter, {
        registry: this.registry,
        assets: this.assets,
        rng: createRng(),
      });
      if (this.patch) {
        this.graph.setPatch(this.patch);
        await this.graph.prepare(this.patch);
      }
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  play(note: number, velocity: number): void {
    if (!this.ctx) {
      void this.start().then(() => this.play(note, velocity));
      return;
    }
    this.graph?.trigger(note, velocity, this.ctx.currentTime + LOOKAHEAD);
  }
}
