/**
 * Variable-shape oscillator as Fourier series. Shape morphs continuously
 * sine (0) → triangle (1) → saw (2) → square (3) → pulse (4, at `pulseWidth`). A linear blend of
 * two waveforms is the same blend of their coefficients, so every point on the morph is exact
 * and band-limited by the browser's PeriodicWave.
 */
export const HARMONICS = 128;

export interface WaveCoefficients {
  /** Cosine terms, index 0 is DC (always 0). */
  real: Float32Array;
  /** Sine terms. */
  imag: Float32Array;
}

type Shape = (n: number) => [cos: number, sin: number];

const sine: Shape = (n) => [0, n === 1 ? 1 : 0];
const triangle: Shape = (n) =>
  n % 2 === 1 ? [0, (8 / (Math.PI * Math.PI * n * n)) * (((n - 1) / 2) % 2 === 0 ? 1 : -1)] : [0, 0];
const saw: Shape = (n) => [0, 2 / (Math.PI * n)];
/** ±1 pulse, high for the first `d` of the cycle (d = 0.5 is a square). */
const pulse =
  (d: number): Shape =>
  (n) => [
    (2 * Math.sin(2 * Math.PI * n * d)) / (Math.PI * n),
    (2 * (1 - Math.cos(2 * Math.PI * n * d))) / (Math.PI * n),
  ];

export function waveCoefficients(shape: number, pulseWidth: number, harmonics = HARMONICS): WaveCoefficients {
  const s = Math.min(4, Math.max(0, shape));
  const seg = Math.min(3, Math.floor(s));
  const t = s - seg;
  const ends: [Shape, Shape][] = [
    [sine, triangle],
    [triangle, saw],
    [saw, pulse(0.5)],
    [pulse(0.5), pulse(pulseWidth)],
  ];
  const [a, b] = ends[seg]!;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    const [ac, as] = a(n);
    const [bc, bs] = b(n);
    real[n] = ac + (bc - ac) * t;
    imag[n] = as + (bs - as) * t;
  }
  return { real, imag };
}

const cache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/** PeriodicWave for a shape, cached per context at 1/100 resolution. */
export function getWave(ctx: BaseAudioContext, shape: number, pulseWidth: number): PeriodicWave {
  const s = Math.round(shape * 100) / 100;
  const pw = s > 3 ? Math.round(pulseWidth * 100) / 100 : 0.5;
  const key = `${s}:${pw}`;
  let map = cache.get(ctx);
  if (!map) cache.set(ctx, (map = new Map()));
  let wave = map.get(key);
  if (!wave) {
    const { real, imag } = waveCoefficients(s, pw);
    wave = ctx.createPeriodicWave(real, imag);
    map.set(key, wave);
  }
  return wave;
}
