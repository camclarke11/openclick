import { dbToGain, MAX_LAYERS, type FxSlot, type Patch } from './patch';
import { num } from './params';
import type { Rng } from './rng';
import type { AssetStore, EffectInstance, NoteEvent, Registry, Voice } from './types';

/** Gate used for a played note when the arpeggiator is off. */
export const DEFAULT_GATE = 0.25;

interface ActiveVoice {
  voice: Voice;
  /** Per-voice node the engine created (pan), disconnected when the voice ends. */
  node: AudioNode | null;
}

interface LayerBus {
  gain: GainNode;
  pan: StereoPannerNode;
}

interface FxNode {
  slot: FxSlot;
  instance: EffectInstance;
}

/**
 * The audio graph for one patch, usable in a realtime AudioContext or an OfflineAudioContext
 * (WAV export renders through exactly the same code as the pads):
 *
 *   voice -> [voice pan] -> layer gain -> layer pan -> fx 1 -> ... -> fx n -> master gain -> out
 */
export class SoundGraph {
  readonly ctx: BaseAudioContext;
  private readonly registry: Registry;
  private readonly assets: AssetStore;
  private readonly rng: Rng;
  private readonly layers: LayerBus[] = [];
  private readonly fxIn: GainNode;
  private readonly master: GainNode;
  private fx: FxNode[] = [];
  private active: ActiveVoice[] = [];
  private patch: Patch | null = null;

  constructor(
    ctx: BaseAudioContext,
    destination: AudioNode,
    opts: { registry: Registry; assets: AssetStore; rng: Rng },
  ) {
    this.ctx = ctx;
    this.registry = opts.registry;
    this.assets = opts.assets;
    this.rng = opts.rng;
    this.fxIn = ctx.createGain();
    this.master = ctx.createGain();
    this.master.connect(destination);
    for (let i = 0; i < MAX_LAYERS; i++) {
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      gain.connect(pan).connect(this.fxIn);
      this.layers.push({ gain, pan });
    }
    this.fxIn.connect(this.master);
  }

  /** Load samples/worklets the patch needs. Safe to call repeatedly. */
  async prepare(patch: Patch): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const l of patch.layers) {
      const mod = this.registry.sources.get(l.source);
      if (mod?.prepare) jobs.push(mod.prepare(l.params, this.ctx, this.assets));
    }
    for (const f of patch.fx) {
      const mod = this.registry.effects.get(f.type);
      if (mod?.prepare) jobs.push(mod.prepare(this.ctx));
    }
    await Promise.all(jobs);
  }

  setPatch(patch: Patch): void {
    this.patch = patch;
    this.layers.forEach((bus, i) => {
      const l = patch.layers[i];
      bus.gain.gain.value = l?.enabled ? dbToGain(num(l.mix, 'gain')) : 0;
      bus.pan.pan.value = l ? num(l.mix, 'pan') : 0;
    });
    this.master.gain.value = dbToGain(patch.master.gain);
    this.syncFx(patch.fx.filter((f) => f.enabled && this.registry.effects.has(f.type)));
  }

  /** Rebuild the chain only when its shape changes; otherwise push params so tails survive. */
  private syncFx(slots: FxSlot[]): void {
    const sameShape =
      slots.length === this.fx.length && slots.every((s, i) => s.type === this.fx[i]?.slot.type);
    if (sameShape) {
      slots.forEach((s, i) => {
        const node = this.fx[i]!;
        if (node.slot.params !== s.params) node.instance.update(s.params);
        node.slot = s;
      });
      return;
    }
    this.fxIn.disconnect();
    for (const n of this.fx) n.instance.dispose();
    this.fx = slots.map((slot) => ({
      slot,
      instance: this.registry.effects.get(slot.type)!.create(this.ctx, slot.params, this.rng),
    }));
    let prev: AudioNode = this.fxIn;
    for (const n of this.fx) {
      prev.connect(n.instance.input);
      prev = n.instance.output;
    }
    prev.connect(this.master);
  }

  /** Seconds of effect tail for the current chain. */
  fxTail(): number {
    return this.fx.reduce((t, n) => t + this.registry.effects.get(n.slot.type)!.tail(n.slot.params), 0);
  }

  /** Play a note at `time` through every enabled layer. Returns when the last voice ends. */
  trigger(note: number, velocity: number, time: number): number {
    const patch = this.patch;
    if (!patch) return time;
    this.reap(time);
    const base: NoteEvent = { note, velocity, time, gate: DEFAULT_GATE, pan: 0 };
    const events = patch.arp.enabled === true ? this.registry.arp.expand(patch.arp, base, this.rng) : [base];
    let end = time;
    patch.layers.forEach((layer, i) => {
      const mod = this.registry.sources.get(layer.source);
      const bus = this.layers[i];
      if (!layer.enabled || !mod || !bus) return;
      for (const ev of events) {
        const e: NoteEvent = {
          ...ev,
          note: ev.note + num(layer.mix, 'transpose'),
          time: ev.time + num(layer.mix, 'delay') / 1000,
        };
        let out: AudioNode = bus.gain;
        let node: AudioNode | null = null;
        if (e.pan !== 0) {
          const p = this.ctx.createStereoPanner();
          p.pan.value = Math.max(-1, Math.min(1, e.pan));
          p.connect(bus.gain);
          out = node = p;
        }
        const voice = mod.createVoice(
          { ctx: this.ctx, output: out, rng: this.rng, assets: this.assets },
          layer.params,
          e,
        );
        this.active.push({ voice, node });
        end = Math.max(end, voice.endTime);
      }
    });
    return end;
  }

  /** Stop everything now. */
  panic(): void {
    const t = this.ctx.currentTime;
    for (const a of this.active) a.voice.stop?.(t);
  }

  private reap(now: number): void {
    this.active = this.active.filter((a) => {
      if (a.voice.endTime > now) return true;
      a.node?.disconnect();
      return false;
    });
  }
}
