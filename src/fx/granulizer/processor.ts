// AudioWorklet processor for the granulizer. Bundled by Vite via `?worker&url`.
import { createGrainEngine, type GrainEngine, type GrainSettings } from './dsp';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: unknown): void;

class GranulizerProcessor extends AudioWorkletProcessor {
  private readonly engine: GrainEngine;
  private mono = new Float32Array(128);
  private alive = true;

  constructor(options: { processorOptions: { settings: GrainSettings; seed: number } }) {
    super();
    this.engine = createGrainEngine(sampleRate, options.processorOptions.seed);
    this.engine.set(options.processorOptions.settings);
    this.port.onmessage = (e: MessageEvent<GrainSettings | null>) => {
      if (e.data) this.engine.set(e.data);
      else this.alive = false;
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const [outL, outR] = outputs[0] ?? [];
    if (!outL || !outR) return this.alive;
    if (this.mono.length !== outL.length) this.mono = new Float32Array(outL.length);
    const mono = this.mono;
    mono.fill(0);
    for (const ch of input) for (let i = 0; i < mono.length; i++) mono[i] = mono[i]! + ch[i]! / input.length;
    this.engine.process(mono, outL, outR);
    return this.alive;
  }
}

registerProcessor('openclick-granulizer', GranulizerProcessor);
