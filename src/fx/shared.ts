import { loadWorklet, type NumberParam } from '../core';

/** Time constant for smoothed param changes: fast enough to feel instant, slow enough not to click. */
const SMOOTH = 0.012;

/** Glide an AudioParam to a value so knob moves never click. */
export function glide(ctx: BaseAudioContext, param: AudioParam, value: number, tc = SMOOTH): void {
  param.setTargetAtTime(value, ctx.currentTime, tc);
}

/** The standard wet/dry mix param every effect carries. */
export const mixParam = (def: number, randomRange: [number, number] = [0.2, 0.8]): NumberParam => ({
  kind: 'number',
  label: 'Mix',
  group: 'Output',
  min: 0,
  max: 1,
  default: def,
  step: 0.01,
  unit: '%',
  randomRange,
  hint: 'Balance between the dry input and the effect.',
});

/**
 * 'equal-power' suits effects whose wet signal is decorrelated from the dry one (delay, reverb,
 * chorus, grains); 'linear' suits ones where wet and dry are strongly correlated (EQ, crusher,
 * dispersion), where equal power would boost the middle of the knob.
 */
export type MixLaw = 'linear' | 'equal-power';

export function mixGains(mix: number, law: MixLaw): { dry: number; wet: number } {
  const m = Math.min(1, Math.max(0, mix));
  if (law === 'linear') return { dry: 1 - m, wet: m };
  return { dry: Math.cos((m * Math.PI) / 2), wet: Math.sin((m * Math.PI) / 2) };
}

/**
 * Input/output frame shared by every effect:
 *
 *   input -> dry ----------------------> output
 *   input -> (effect: connect from `input`, into `wet`) -> wet -> output
 */
export interface MixFrame {
  input: GainNode;
  output: GainNode;
  wet: GainNode;
  setMix(mix: number, immediate?: boolean): void;
  dispose(): void;
}

export function createMixFrame(ctx: BaseAudioContext, mix: number, law: MixLaw): MixFrame {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  const setMix = (m: number, immediate = false) => {
    const g = mixGains(m, law);
    if (immediate) {
      dry.gain.value = g.dry;
      wet.gain.value = g.wet;
    } else {
      glide(ctx, dry.gain, g.dry);
      glide(ctx, wet.gain, g.wet);
    }
  };
  setMix(mix, true);
  return {
    input,
    output,
    wet,
    setMix,
    dispose() {
      for (const n of [input, output, dry, wet]) n.disconnect();
    },
  };
}

const readyProcessors = new WeakMap<BaseAudioContext, Set<string>>();

const canUseWorklets = (ctx: BaseAudioContext) =>
  typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet !== undefined;

/**
 * Load a worklet module and remember that `name` is registered in `ctx`. Never rejects: if
 * worklets are unavailable (Node tests, very old browsers) the effect stays a clean passthrough.
 */
export async function prepareProcessor(ctx: BaseAudioContext, url: string, name: string): Promise<void> {
  if (!canUseWorklets(ctx)) return;
  try {
    await loadWorklet(ctx, url);
    let set = readyProcessors.get(ctx);
    if (!set) readyProcessors.set(ctx, (set = new Set()));
    set.add(name);
  } catch (err) {
    console.warn(`OpenClick: could not load the ${name} worklet`, err);
  }
}

export interface WorkletSlot {
  /** Send new settings to the processor (kept and replayed if it is still loading). */
  post(settings: unknown): void;
  dispose(): void;
}

/**
 * Put an AudioWorkletNode between `from` and `to`. The engine can create effects before
 * `prepare` has finished (adding an effect live), so until the processor is registered the slot
 * passes audio through unchanged, then swaps the processor in.
 */
export function createWorkletSlot(
  ctx: BaseAudioContext,
  from: AudioNode,
  to: AudioNode,
  opts: { url: string; name: string; settings: unknown; processorOptions?: Record<string, unknown> },
): WorkletSlot {
  let node: AudioWorkletNode | null = null;
  let settings = opts.settings;
  let disposed = false;
  const attach = () => {
    node = new AudioWorkletNode(ctx, opts.name, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { ...opts.processorOptions, settings },
    });
    from.connect(node).connect(to);
  };
  if (readyProcessors.get(ctx)?.has(opts.name)) {
    attach();
  } else {
    from.connect(to);
    void prepareProcessor(ctx, opts.url, opts.name).then(() => {
      if (disposed || !readyProcessors.get(ctx)?.has(opts.name)) return;
      from.disconnect(to);
      attach();
    });
  }
  return {
    post(s) {
      settings = s;
      node?.port.postMessage(s);
    },
    dispose() {
      disposed = true;
      if (node) {
        node.port.postMessage(null);
        node.disconnect();
      }
    },
  };
}
