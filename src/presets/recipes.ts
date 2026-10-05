import { createRng, sanitizePatch, type Params, type Patch, type Registry, type Rng } from '../core';
import type { Category } from './categories';

/**
 * Smart randomise: "generate a <category>" recipes. Each recipe draws a patch from a narrow,
 * on-target region of parameter space (a coin is a square blip plus a higher blip shortly after;
 * a laser is a fast downward sweep), so one click gives a usable sound rather than noise.
 *
 * Recipes write params by name and the result goes through sanitizePatch, so names a module does
 * not (yet) have are dropped and missing ones take defaults. That keeps recipes valid while the
 * engines' schemas evolve.
 */
interface LayerDraft {
  source: 'beep' | 'click';
  params: Params;
  mix?: { gain?: number; pan?: number; transpose?: number; delay?: number };
}

interface PatchDraft {
  layers: LayerDraft[];
  fx?: { type: string; params?: Params }[];
  arp?: Params;
  master?: number;
}

type Recipe = (r: Rng) => PatchDraft;

const between = (r: Rng, lo: number, hi: number) => r.range(lo, hi);
/** Log-uniform, for times and frequencies. */
const logBetween = (r: Rng, lo: number, hi: number) => Math.exp(r.range(Math.log(lo), Math.log(hi)));
const semis = (r: Rng, options: readonly number[]) => r.pick(options);

const blip = (r: Rng, wave: string, decay: [number, number], extra: Params = {}): Params => ({
  wave,
  attack: logBetween(r, 0.001, 0.004),
  decay: logBetween(r, decay[0], decay[1]),
  sweep: 0,
  ...extra,
});

const tick = (r: Rng, tone: [number, number], length: [number, number]): Params => ({
  tone: logBetween(r, tone[0], tone[1]),
  length: logBetween(r, length[0], length[1]),
});

const chip = (r: Rng) => r.pick(['square', 'square', 'triangle', 'sawtooth']);

export const recipes: Record<Category, Recipe> = {
  'UI/Click': (r) => ({
    layers: [
      { source: 'click', params: tick(r, [2500, 9000], [0.004, 0.015]) },
      ...(r.next() < 0.5
        ? [
            {
              source: 'beep' as const,
              params: blip(r, 'sine', [0.01, 0.03]),
              mix: { gain: -14, transpose: 24 },
            },
          ]
        : []),
    ],
  }),
  'UI/Tap': (r) => ({
    layers: [
      { source: 'click', params: tick(r, [800, 2500], [0.01, 0.03]) },
      {
        source: 'beep',
        params: blip(r, 'sine', [0.02, 0.05]),
        mix: { gain: -10, transpose: semis(r, [0, 7, 12]) },
      },
    ],
  }),
  'UI/Toggle': (r) => {
    const up = r.next() < 0.5;
    return {
      layers: [
        {
          source: 'beep',
          params: blip(r, r.pick(['sine', 'triangle']), [0.04, 0.09], {
            sweep: (up ? 1 : -1) * between(r, 3, 7),
            sweepTime: logBetween(r, 0.02, 0.06),
          }),
          mix: { transpose: semis(r, [0, 5, 12]) },
        },
        { source: 'click', params: tick(r, [2000, 6000], [0.004, 0.01]), mix: { gain: -8 } },
      ],
    };
  },
  'UI/Hover': (r) => ({
    layers: [
      {
        source: 'beep',
        params: { ...blip(r, 'sine', [0.03, 0.08]), attack: logBetween(r, 0.005, 0.02) },
        mix: { gain: -12, transpose: semis(r, [12, 19, 24]) },
      },
    ],
  }),
  'UI/Swipe': (r) => ({
    layers: [
      {
        source: 'beep',
        params: {
          ...blip(r, r.pick(['sine', 'triangle']), [0.12, 0.25]),
          attack: logBetween(r, 0.02, 0.06),
          sweep: (r.next() < 0.5 ? 1 : -1) * between(r, 12, 24),
          sweepTime: logBetween(r, 0.1, 0.2),
        },
        mix: { gain: -6 },
      },
      { source: 'click', params: tick(r, [3000, 10000], [0.08, 0.2]), mix: { gain: -12 } },
    ],
  }),
  'UI/Notification': (r) => {
    const gap = between(r, 70, 140);
    const interval = semis(r, [4, 5, 7, 12]);
    const p = blip(r, r.pick(['sine', 'triangle']), [0.25, 0.7]);
    return {
      layers: [
        { source: 'beep', params: p, mix: { transpose: 12 } },
        { source: 'beep', params: p, mix: { transpose: 12 + interval, delay: gap } },
      ],
      master: -3,
    };
  },
  'UI/Success': (r) => {
    const chord = r.pick([
      [0, 4, 7],
      [0, 7, 12],
      [0, 4, 7, 12],
      [0, 5, 9],
    ]);
    const gap = between(r, 50, 90);
    const p = blip(r, r.pick(['sine', 'triangle', 'square']), [0.15, 0.35]);
    return {
      layers: chord.map((t, i) => ({
        source: 'beep' as const,
        params: p,
        mix: { transpose: 12 + t, delay: i * gap, gain: -2 },
      })),
      master: -4,
    };
  },
  'UI/Error': (r) => {
    const p = blip(r, r.pick(['square', 'sawtooth']), [0.12, 0.2], {
      sweep: -between(r, 0, 2),
      sweepTime: 0.1,
    });
    const gap = between(r, 120, 180);
    return {
      layers: [
        { source: 'beep', params: p, mix: { transpose: -5 } },
        { source: 'beep', params: p, mix: { transpose: -5 - semis(r, [1, 3, 6]), delay: gap } },
      ],
      master: -8,
    };
  },

  'Foley/Switch': (r) => ({
    layers: [
      { source: 'click', params: tick(r, [1500, 4500], [0.005, 0.015]) },
      {
        source: 'click',
        params: tick(r, [800, 3000], [0.005, 0.02]),
        mix: { delay: between(r, 15, 50), gain: -4 },
      },
    ],
  }),
  'Foley/Keyboard': (r) => ({
    layers: [
      { source: 'click', params: tick(r, [800, 3000], [0.01, 0.04]) },
      {
        source: 'click',
        params: tick(r, [3000, 8000], [0.003, 0.01]),
        mix: { gain: -8, delay: between(r, 0, 8) },
      },
    ],
  }),
  'Foley/Camera': (r) => ({
    layers: [
      { source: 'click', params: tick(r, [1500, 5000], [0.01, 0.03]) },
      {
        source: 'click',
        params: tick(r, [2000, 7000], [0.02, 0.06]),
        mix: { delay: between(r, 60, 140), gain: -2 },
      },
      {
        source: 'beep',
        params: blip(r, 'sawtooth', [0.04, 0.08], { sweep: between(r, 5, 12), sweepTime: 0.05 }),
        mix: { gain: -20, transpose: -12, delay: between(r, 10, 40) },
      },
    ],
  }),
  'Foley/Toy': (r) => ({
    layers: [
      {
        source: 'beep',
        params: blip(r, r.pick(['triangle', 'sine', 'square']), [0.1, 0.3], {
          sweep: (r.next() < 0.6 ? 1 : -1) * between(r, 5, 19),
          sweepTime: logBetween(r, 0.05, 0.2),
        }),
        mix: { transpose: semis(r, [0, 7, 12]) },
      },
      { source: 'click', params: tick(r, [1000, 3000], [0.01, 0.03]), mix: { gain: -10 } },
    ],
  }),
  'Foley/Mechanism': (r) => {
    const n = r.int(2, 4);
    const gap = between(r, 25, 70);
    return {
      layers: Array.from({ length: n }, (_, i) => ({
        source: 'click' as const,
        params: tick(r, [500, 3500], [0.008, 0.03]),
        mix: { delay: i * gap * between(r, 0.8, 1.2), gain: -i * 2, pan: between(r, -0.3, 0.3) },
      })),
      master: -3,
    };
  },

  'Game/Jump': (r) => ({
    layers: [
      {
        source: 'beep',
        params: blip(r, chip(r), [0.15, 0.3], {
          sweep: between(r, 10, 24),
          sweepTime: logBetween(r, 0.1, 0.25),
        }),
        mix: { transpose: semis(r, [0, 5, 7]) },
      },
    ],
    master: -3,
  }),
  'Game/Coin': (r) => {
    const p = blip(r, r.pick(['square', 'square', 'triangle']), [0.25, 0.45]);
    return {
      layers: [
        { source: 'beep', params: { ...p, decay: logBetween(r, 0.05, 0.08) }, mix: { transpose: 23 } },
        {
          source: 'beep',
          params: p,
          mix: { transpose: 23 + semis(r, [5, 5, 7]), delay: between(r, 55, 85) },
        },
      ],
      master: -6,
    };
  },
  'Game/Power-up': (r) => {
    const p = blip(r, chip(r), [0.4, 0.7], { sweep: between(r, 19, 36), sweepTime: logBetween(r, 0.3, 0.6) });
    return {
      layers: [
        { source: 'beep', params: p },
        { source: 'beep', params: p, mix: { transpose: 12, gain: -8, delay: between(r, 30, 60) } },
      ],
      master: -6,
    };
  },
  'Game/Laser': (r) => ({
    layers: [
      {
        source: 'beep',
        params: blip(r, r.pick(['square', 'sawtooth']), [0.12, 0.3], {
          sweep: -between(r, 20, 44),
          sweepTime: logBetween(r, 0.08, 0.25),
        }),
        mix: { transpose: semis(r, [12, 19, 24]) },
      },
    ],
    master: -6,
  }),
  'Game/Hit': (r) => ({
    layers: [
      { source: 'click', params: tick(r, [300, 1200], [0.05, 0.12]), mix: { transpose: -12 } },
      {
        source: 'beep',
        params: blip(r, r.pick(['square', 'triangle']), [0.06, 0.12], {
          sweep: -between(r, 12, 30),
          sweepTime: 0.06,
        }),
        mix: { transpose: -semis(r, [0, 5, 12]), gain: -4 },
      },
    ],
    master: -3,
  }),
  'Game/Explosion': (r) => ({
    layers: [
      {
        source: 'click',
        params: tick(r, [200, 700], [0.12, 0.2]),
        mix: { transpose: -semis(r, [12, 19, 24]) },
      },
      {
        source: 'beep',
        params: {
          ...blip(r, 'sawtooth', [0.5, 1.1]),
          sweep: -between(r, 24, 40),
          sweepTime: logBetween(r, 0.3, 0.8),
        },
        mix: { transpose: -semis(r, [12, 24]), gain: -4 },
      },
      {
        source: 'click',
        params: tick(r, [300, 1500], [0.1, 0.2]),
        mix: { delay: between(r, 30, 80), gain: -6 },
      },
    ],
    master: -3,
  }),
  'Game/Menu': (r) => ({
    layers: [
      {
        source: 'beep',
        params: blip(r, chip(r), [0.03, 0.07]),
        mix: { transpose: semis(r, [12, 17, 19, 24]) },
      },
    ],
    master: -6,
  }),
  'Game/Pickup': (r) => {
    const p = blip(r, chip(r), [0.08, 0.15], {
      sweep: between(r, 5, 12),
      sweepTime: logBetween(r, 0.03, 0.08),
    });
    return {
      layers: [
        { source: 'beep', params: p, mix: { transpose: 12 } },
        { source: 'beep', params: p, mix: { transpose: 24, delay: between(r, 40, 70), gain: -4 } },
      ],
      master: -6,
    };
  },
};

/** Generate a fresh on-target patch for a category. Pass a seed for reproducible results. */
export function generatePatch(registry: Registry, category: Category, seed?: number): Patch {
  const draft = recipes[category](createRng(seed));
  return sanitizePatch(registry, {
    layers: draft.layers.map((l) => ({
      enabled: true,
      source: l.source,
      params: l.params,
      mix: l.mix ?? {},
    })),
    arp: draft.arp ?? {},
    fx: (draft.fx ?? []).map((f) => ({ type: f.type, enabled: true, params: f.params ?? {} })),
    master: { gain: draft.master ?? 0 },
  });
}
