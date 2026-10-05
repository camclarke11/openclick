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
const chance = (r: Rng, p: number) => r.next() < p;

// Beep shape positions: sine 0, triangle 1, saw 2, square 3, pulse 4.
const SINE = 0;
const TRIANGLE = 1;
const SAW = 2;
const SQUARE = 3;
const PULSE = 4;

/** Classic chip voices: square, narrow pulse, occasionally triangle. */
const chip = (r: Rng): Params => {
  const shape = r.pick([SQUARE, SQUARE, PULSE, PULSE, TRIANGLE]);
  return shape === PULSE ? { shape, pulseWidth: r.pick([0.125, 0.25]) } : { shape };
};

/** A short percussive Beep voice. Note: Beep's `sweep` is where the pitch starts, relative to the note. */
const beep = (r: Rng, decay: [number, number], extra: Params = {}): Params => {
  const d = logBetween(r, decay[0], decay[1]);
  // Release matches decay so a tail longer than the 0.25 s gate rings out instead of being cut.
  return {
    shape: SINE,
    attack: logBetween(r, 0.001, 0.003),
    hold: 0,
    decay: d,
    sustain: 0,
    release: d,
    ...extra,
  };
};

/** Beep step sequencer in retrigger mode: each step re-fires the envelope, so no sustain is needed. */
const arpeggio = (values: number[], rate: number): Params => ({
  seqOn: true,
  seqMode: 'retrigger',
  seqScale: 'chromatic',
  seqLoop: false,
  seqSteps: [...values, ...Array<number>(16 - values.length).fill(0)],
  seqLength: values.length,
  seqRate: rate,
});

/** A Click sample voice. Sound names are `Category/Name` from the sample manifest. */
const click = (r: Rng, sounds: readonly string[], extra: Params = {}): Params => ({
  sound: r.pick(sounds),
  roundRobin: 'random',
  pitch: 0,
  humanize: between(r, 5, 25),
  ...extra,
});

/** Effect slots. Names and ranges follow src/fx; unknown effects are dropped by sanitizePatch. */
const reverb = (r: Rng, size: [number, number], mix: [number, number]) => ({
  type: 'reverb',
  params: {
    size: between(r, ...size),
    decay: logBetween(r, 0.5 + size[0], 1 + size[1] * 2),
    mix: between(r, ...mix),
  },
});
const crush = (r: Rng) => ({
  type: 'bitcrusher',
  params: { bits: r.pick([5, 6, 7, 8]), rate: r.pick([11025, 16000, 22050]) },
});
const echo = (r: Rng) => ({
  type: 'delay',
  params: {
    time: between(r, 70, 140),
    feedback: between(r, 0.15, 0.35),
    mix: between(r, 0.1, 0.25),
    pingPong: chance(r, 0.5),
  },
});

const SWITCHES = [
  'Switches/Toggle',
  'Switches/Rocker',
  'Switches/Light switch',
  'Switches/Slide',
  'Switches/Rotary detent',
];
const KEYS = [
  'Keyboards/Clicky key',
  'Keyboards/Linear key',
  'Keyboards/Spacebar',
  'Keyboards/Laptop key',
  'Keyboards/Typewriter',
  'Keyboards/Enter key',
];
const CAMERAS = [
  'Cameras/SLR shutter',
  'Cameras/Compact shutter',
  'Cameras/Film advance',
  'Cameras/Lens cap',
  'Cameras/Mode dial',
];
const TOYS = ['Toys/Squeaker', 'Toys/Clicker', 'Toys/Wind-up', 'Toys/Spring', 'Toys/Rattle'];
const PANELS = [
  'Control panels/Big button',
  'Control panels/Knob detent',
  'Control panels/Lever',
  'Control panels/Key switch',
  'Control panels/Relay',
  'Control panels/Latch',
];

export const recipes: Record<Category, Recipe> = {
  'UI/Click': (r) => ({
    layers: [
      {
        source: 'click',
        params: click(
          r,
          ['Switches/Push button', 'Keyboards/Laptop key', 'Control panels/Knob detent', 'Toys/Clicker'],
          {
            pitch: r.int(0, 7),
            length: logBetween(r, 0.04, 0.12),
            fade: 0.01,
            filter: 'highpass',
            cutoff: logBetween(r, 600, 2000),
          },
        ),
      },
      ...(chance(r, 0.5)
        ? [{ source: 'beep' as const, params: beep(r, [0.01, 0.03]), mix: { gain: -16, transpose: 24 } }]
        : []),
    ],
  }),
  'UI/Tap': (r) => ({
    layers: [
      {
        source: 'click',
        params: click(r, ['Keyboards/Linear key', 'Switches/Push button', 'Keyboards/Laptop key'], {
          pitch: r.int(-3, 3),
          length: logBetween(r, 0.05, 0.1),
          filter: 'lowpass',
          cutoff: logBetween(r, 3000, 7000),
        }),
      },
      {
        source: 'beep',
        params: beep(r, [0.02, 0.05], { shape: between(r, SINE, TRIANGLE), pitchEnv: 12, pitchDecay: 0.015 }),
        mix: { gain: -10, transpose: semis(r, [0, 7, 12]) },
      },
    ],
  }),
  'UI/Toggle': (r) => {
    const on = chance(r, 0.5);
    return {
      layers: [
        {
          source: 'click',
          params: click(r, ['Switches/Toggle', 'Switches/Rocker', 'Switches/Light switch'], {
            length: logBetween(r, 0.06, 0.15),
          }),
        },
        {
          source: 'beep',
          params: beep(r, [0.05, 0.09], {
            shape: between(r, SINE, 1.2),
            sweep: (on ? -1 : 1) * between(r, 3, 7),
            sweepTime: logBetween(r, 0.02, 0.06),
          }),
          mix: { gain: -8, transpose: semis(r, [12, 17, 19]) },
        },
      ],
    };
  },
  'UI/Hover': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.03, 0.08], {
          shape: between(r, SINE, 0.6),
          attack: logBetween(r, 0.005, 0.02),
          cutoff: logBetween(r, 3000, 8000),
          sweep: between(r, -2, 2),
          sweepTime: 0.03,
        }),
        mix: { gain: -6, transpose: semis(r, [12, 19, 24]) },
      },
    ],
  }),
  'UI/Swipe': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.1, 0.25], {
          oscLevel: 0,
          noiseLevel: 0.8,
          noiseType: r.pick(['white', 'pink']),
          filterType: 'bandpass',
          cutoff: logBetween(r, 1200, 4000),
          resonance: between(r, 1, 4),
          filterEnv: (chance(r, 0.5) ? 1 : -1) * between(r, 1, 2.5),
          filterDecay: logBetween(r, 0.1, 0.25),
          attack: logBetween(r, 0.02, 0.06),
        }),
        mix: { gain: 6 },
      },
      ...(chance(r, 0.5)
        ? [{ source: 'click' as const, params: click(r, ['Switches/Slide']), mix: { gain: -12 } }]
        : []),
    ],
  }),
  'UI/Notification': (r) => {
    const gap = between(r, 80, 140);
    const interval = semis(r, [4, 5, 7, 12]);
    const p = beep(r, [0.3, 0.7], {
      shape: between(r, SINE, 0.8),
      fmIndex: between(r, 0.5, 2),
      fmRatio: r.pick([2, 3, 3.5, 4]),
      fmDecay: logBetween(r, 0.05, 0.2),
    });
    return {
      layers: [
        { source: 'beep', params: p, mix: { transpose: 12 } },
        { source: 'beep', params: p, mix: { transpose: 12 + interval, delay: gap } },
      ],
      fx: [reverb(r, [0.3, 0.6], [0.12, 0.25])],
      master: -4,
    };
  },
  'UI/Success': (r) => {
    const chord = r.pick([
      [0, 4, 7, 12],
      [0, 7, 12],
      [0, 5, 9, 12],
      [0, 4, 7],
    ]);
    return {
      layers: [
        {
          source: 'beep',
          params: beep(r, [0.12, 0.3], {
            shape: r.pick([SINE, TRIANGLE, SQUARE]),
            cutoff: logBetween(r, 3000, 9000),
            ...arpeggio(chord, between(r, 0.05, 0.08)),
          }),
          mix: { transpose: 12 },
        },
      ],
      fx: chance(r, 0.6) ? [reverb(r, [0.3, 0.5], [0.1, 0.2])] : [],
      master: -3,
    };
  },
  'UI/Error': (r) => {
    const p = beep(r, [0.06, 0.1], {
      shape: between(r, SAW, SQUARE),
      hold: between(r, 0.06, 0.1),
      cutoff: logBetween(r, 1200, 2500),
      speaker: chance(r, 0.4) ? 'phone' : 'off',
    });
    const gap = between(r, 120, 180);
    return {
      layers: [
        { source: 'beep', params: p, mix: { transpose: -5 } },
        { source: 'beep', params: p, mix: { transpose: -5 - semis(r, [1, 3, 6]), delay: gap } },
      ],
      master: -4,
    };
  },

  'Foley/Switch': (r) => ({
    layers: [
      { source: 'click', params: click(r, SWITCHES, { pitch: r.int(-3, 3) }) },
      ...(chance(r, 0.4)
        ? [
            {
              source: 'click' as const,
              params: click(r, ['Control panels/Latch', 'Switches/Push button'], { pitch: r.int(-5, 0) }),
              mix: { delay: between(r, 20, 60), gain: -6 },
            },
          ]
        : []),
    ],
  }),
  'Foley/Keyboard': (r) => ({
    layers: [
      {
        source: 'click',
        params: click(r, KEYS, {
          pitch: r.int(-2, 2),
          ...(chance(r, 0.3) ? { filter: 'lowpass', cutoff: logBetween(r, 2500, 8000) } : {}),
        }),
      },
    ],
  }),
  'Foley/Camera': (r) => ({
    layers: [
      { source: 'click', params: click(r, CAMERAS, { pitch: r.int(-2, 2) }) },
      ...(chance(r, 0.5)
        ? [
            {
              source: 'click' as const,
              params: click(r, ['Cameras/Film advance', 'Cameras/Mode dial']),
              mix: { delay: between(r, 120, 250), gain: -4 },
            },
          ]
        : []),
    ],
  }),
  'Foley/Toy': (r) => ({
    layers: [
      { source: 'click', params: click(r, TOYS, { pitch: r.int(-4, 4) }) },
      ...(chance(r, 0.5)
        ? [
            {
              source: 'beep' as const,
              params: beep(r, [0.1, 0.3], {
                shape: TRIANGLE,
                sweep: (chance(r, 0.6) ? -1 : 1) * between(r, 5, 19),
                sweepTime: logBetween(r, 0.05, 0.2),
              }),
              mix: { gain: -8, transpose: semis(r, [12, 19]) },
            },
          ]
        : []),
    ],
  }),
  'Foley/Mechanism': (r) => ({
    layers: [
      { source: 'click', params: click(r, PANELS, { pitch: r.int(-4, 2) }) },
      {
        source: 'click',
        params: click(r, ['Control panels/Relay', 'Control panels/Latch', 'Control panels/Knob detent']),
        mix: { delay: between(r, 30, 90), gain: -4, pan: between(r, -0.3, 0.3) },
      },
    ],
    master: -2,
  }),

  'Game/Jump': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.15, 0.3], {
          ...chip(r),
          sweep: -between(r, 10, 24),
          sweepTime: logBetween(r, 0.1, 0.25),
          speaker: chance(r, 0.3) ? 'handheld' : 'off',
        }),
        mix: { transpose: semis(r, [0, 5, 7]) },
      },
    ],
    master: -3,
  }),
  'Game/Coin': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.3, 0.5], {
          shape: r.pick([SQUARE, PULSE]),
          pulseWidth: 0.25,
          ...arpeggio([0, semis(r, [5, 5, 7])], between(r, 0.06, 0.09)),
        }),
        mix: { transpose: 23 },
      },
    ],
    fx: chance(r, 0.4) ? [crush(r)] : [],
    master: -4,
  }),
  'Game/Power-up': (r) => {
    const run = r.pick([
      [0, 4, 7, 12, 16, 19, 24],
      [0, 7, 12, 19, 24],
      [0, 2, 4, 5, 7, 9, 11, 12],
    ]);
    const rate = between(r, 0.04, 0.06);
    return {
      layers: [
        {
          source: 'beep',
          params: beep(r, [0.1, 0.16], {
            ...chip(r),
            ...arpeggio(run, rate),
            sweep: -between(r, 3, 7),
            sweepTime: rate,
            vibratoDepth: chance(r, 0.5) ? between(r, 10, 30) : 0,
            vibratoRate: 12,
          }),
        },
      ],
      master: -4,
    };
  },
  'Game/Laser': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.12, 0.3], {
          shape: r.pick([SQUARE, SAW, PULSE]),
          sweep: between(r, 20, 44),
          sweepTime: logBetween(r, 0.08, 0.25),
          sweepCurve: 'exp',
          fmIndex: chance(r, 0.4) ? between(r, 1, 3) : 0,
        }),
        mix: { transpose: semis(r, [0, 7, 12]) },
      },
    ],
    fx: chance(r, 0.4)
      ? [
          {
            type: 'dispersion',
            params: { stages: r.int(12, 40), frequency: logBetween(r, 800, 3000), mix: between(r, 0.3, 0.7) },
          },
        ]
      : [],
    master: -4,
  }),
  'Game/Hit': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.06, 0.12], {
          shape: SQUARE,
          noiseLevel: 0.7,
          noiseType: r.pick(['white', 'chip']),
          sweep: between(r, 12, 30),
          sweepTime: logBetween(r, 0.04, 0.08),
          cutoff: logBetween(r, 2000, 6000),
        }),
        mix: { transpose: -12 },
      },
      {
        source: 'click',
        params: click(r, ['Control panels/Big button', 'Toys/Rattle', 'Control panels/Lever'], {
          pitch: r.int(-12, -5),
        }),
        mix: { gain: -4 },
      },
    ],
    master: -3,
  }),
  'Game/Explosion': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.5, 1.2], {
          oscLevel: 0,
          noiseLevel: 1,
          noiseType: r.pick(['chip', 'white', 'pink']),
          cutoff: logBetween(r, 800, 3000),
          filterEnv: between(r, 2, 3),
          filterDecay: logBetween(r, 0.2, 0.5),
        }),
        mix: { transpose: -semis(r, [12, 19, 24]) },
      },
      {
        source: 'beep',
        params: beep(r, [0.3, 0.6], {
          sweep: between(r, 24, 36),
          sweepTime: logBetween(r, 0.1, 0.3),
          sweepCurve: 'exp',
        }),
        mix: { transpose: -24, gain: -2 },
      },
    ],
    fx: chance(r, 0.6) ? [reverb(r, [0.6, 0.9], [0.2, 0.4])] : [],
    master: -3,
  }),
  'Game/Menu': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.03, 0.07], {
          ...chip(r),
          ...(chance(r, 0.5) ? arpeggio([0, 12], between(r, 0.03, 0.04)) : {}),
        }),
        mix: { transpose: semis(r, [12, 17, 19, 24]) },
      },
    ],
    master: -4,
  }),
  'Game/Pickup': (r) => ({
    layers: [
      {
        source: 'beep',
        params: beep(r, [0.08, 0.15], {
          ...chip(r),
          ...arpeggio(
            r.pick([
              [0, 7, 12],
              [0, 12],
              [0, 4, 7],
            ]),
            between(r, 0.03, 0.05),
          ),
          sweep: -between(r, 2, 5),
          sweepTime: 0.02,
        }),
        mix: { transpose: semis(r, [12, 17, 19]) },
      },
    ],
    fx: chance(r, 0.4) ? [echo(r)] : [],
    master: -4,
  }),
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
