/** Bitcrusher DSP. Plain code shared by the AudioWorklet processor and the unit tests. */

export interface CrusherSettings {
  /** Bit depth, fractional allowed for smooth sweeps. 1 bit = three levels (-1, 0, 1). */
  bits: number;
  /** Target sample rate (Hz) for sample-and-hold downsampling. */
  rate: number;
}

export interface Crusher {
  set(s: CrusherSettings): void;
  /** Process one channel block. `channel` keeps per-channel hold state apart. */
  process(input: Float32Array, output: Float32Array, channel: number): void;
}

// Factory functions rather than classes: Vite's dev server adds Preact refresh code to modules
// that declare capitalised classes, and that code cannot run in the AudioWorklet scope.
export function createCrusher(sampleRate: number): Crusher {
  const phases: number[] = [];
  const holds: number[] = [];
  let settings: CrusherSettings = { bits: 16, rate: 48000 };
  return {
    set(s) {
      settings = s;
    },
    process(input, output, channel) {
      const steps = Math.pow(2, Math.max(1, settings.bits) - 1);
      const inc = Math.min(1, Math.max(0, settings.rate / sampleRate));
      let phase = phases[channel] ?? 1;
      let held = holds[channel] ?? 0;
      for (let i = 0; i < input.length; i++) {
        phase += inc;
        if (phase >= 1) {
          phase -= 1;
          const x = Math.max(-1, Math.min(1, input[i]!));
          held = Math.round(x * steps) / steps;
        }
        output[i] = held;
      }
      phases[channel] = phase;
      holds[channel] = held;
    },
  };
}
