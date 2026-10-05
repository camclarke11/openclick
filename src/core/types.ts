import type { ParamSchema, Params } from './params';
import type { Rng } from './rng';

/**
 * One scheduled note, after the arpeggiator has expanded the played note and the engine has
 * applied layer transpose/delay. Sounds are one-shots: `gate` says how long the note is held,
 * and the voice schedules its own envelope from that.
 */
export interface NoteEvent {
  /** MIDI note number (fractional allowed for microtonal arp lanes). 60 = middle C. */
  note: number;
  /** 0..1. Sources should scale level (and may scale brightness) by this. */
  velocity: number;
  /** Start time in the AudioContext's clock (seconds). */
  time: number;
  /** Gate length in seconds. */
  gate: number;
  /** -1..1 pan offset added on top of the layer pan. */
  pan: number;
}

/** Decoded audio buffers shared across contexts (used by the Click engine's sample library). */
export interface AssetStore {
  get(id: string): AudioBuffer | undefined;
  /** Fetch and decode any ids not loaded yet. Resolves when all are available. */
  load(ids: readonly string[], ctx: BaseAudioContext): Promise<void>;
}

export interface VoiceContext {
  ctx: BaseAudioContext;
  /** Connect the voice's output here. The engine handles layer gain, pan and the fx chain. */
  output: AudioNode;
  rng: Rng;
  assets: AssetStore;
}

export interface Voice {
  /** Context time after which the voice is silent and can be released. */
  endTime: number;
  /** Optional: stop now (panic) with a short fade. */
  stop?(time: number): void;
}

/** A sound source: Beep (synth) and Click (samples). One instance per layer. */
export interface SourceModule {
  type: string;
  label: string;
  schema: ParamSchema;
  /** Load anything async a patch needs (samples, worklets) before it can play in `ctx`. */
  prepare?(params: Params, ctx: BaseAudioContext, assets: AssetStore): Promise<void>;
  createVoice(vc: VoiceContext, params: Params, ev: NoteEvent): Voice;
}

export interface EffectInstance {
  input: AudioNode;
  output: AudioNode;
  /** Apply new params without rebuilding, so tails survive knob moves. */
  update(params: Params): void;
  dispose(): void;
}

/** One effect in the chain (EQ, delay, reverb, ...). */
export interface EffectModule {
  type: string;
  label: string;
  schema: ParamSchema;
  /** Seconds of tail after the input goes silent, used to size offline renders. */
  tail(params: Params): number;
  /** Load worklets etc. for `ctx`. */
  prepare?(ctx: BaseAudioContext): Promise<void>;
  create(ctx: BaseAudioContext, params: Params, rng: Rng): EffectInstance;
}

/** The arpeggiator: turns one played note into a timed list of notes. */
export interface ArpModule {
  /** Must include an `enabled` bool param. */
  schema: ParamSchema;
  expand(params: Params, ev: NoteEvent, rng: Rng): NoteEvent[];
}

export interface Registry {
  sources: ReadonlyMap<string, SourceModule>;
  effects: ReadonlyMap<string, EffectModule>;
  arp: ArpModule;
}

export function createRegistry(parts: {
  sources: SourceModule[];
  effects: EffectModule[];
  arp: ArpModule;
}): Registry {
  return {
    sources: new Map(parts.sources.map((m) => [m.type, m])),
    effects: new Map(parts.effects.map((m) => [m.type, m])),
    arp: parts.arp,
  };
}
