// AudioWorklet processor for the bitcrusher. Bundled by Vite via `?worker&url`.
import { createCrusher, type CrusherSettings } from './dsp';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: unknown): void;

class CrusherProcessor extends AudioWorkletProcessor {
  private readonly crusher = createCrusher(sampleRate);
  private alive = true;

  constructor(options: { processorOptions: { settings: CrusherSettings } }) {
    super();
    this.crusher.set(options.processorOptions.settings);
    this.port.onmessage = (e: MessageEvent<CrusherSettings | null>) => {
      if (e.data) this.crusher.set(e.data);
      else this.alive = false;
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    output.forEach((out, ch) => {
      const src = input[ch] ?? input[0];
      if (src) this.crusher.process(src, out, ch);
      else out.fill(0);
    });
    return this.alive;
  }
}

registerProcessor('openclick-bitcrusher', CrusherProcessor);
