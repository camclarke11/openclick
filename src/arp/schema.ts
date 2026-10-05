import type { NumberParam, ParamSchema, StepsParam } from '../core';

/** Maximum steps per lane. Each lane also has its own active length (1..MAX_STEPS). */
export const MAX_STEPS = 16;

export const DIVISIONS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', '1/64'] as const;

/** Length of one division in beats (quarter notes). */
export const DIVISION_BEATS: Record<(typeof DIVISIONS)[number], number> = {
  '1/4': 1,
  '1/8': 1 / 2,
  '1/8T': 1 / 3,
  '1/16': 1 / 4,
  '1/16T': 1 / 6,
  '1/32': 1 / 8,
  '1/64': 1 / 16,
};

export const DIRECTIONS = ['forward', 'reverse', 'ping-pong', 'random'] as const;

/** The five lanes, in UI order. Each has a `<lane>` steps param and a `<lane>Length` param. */
export const LANES = ['pitch', 'velocity', 'pan', 'repeats', 'gate'] as const;
export type Lane = (typeof LANES)[number];

const lane = (label: string, min: number, max: number, def: number[], step?: number): StepsParam => ({
  kind: 'steps',
  label,
  group: label,
  length: MAX_STEPS,
  min,
  max,
  step,
  default: Array.from({ length: MAX_STEPS }, (_, i) => def[i % def.length]!),
});

const laneLength = (group: string, def: number): NumberParam => ({
  kind: 'number',
  label: 'Length',
  group,
  min: 1,
  max: MAX_STEPS,
  step: 1,
  default: def,
  randomRange: [2, 8],
  hint: 'Steps in this lane before it wraps. With polymeter on, lanes of different lengths drift against each other.',
});

export const arpSchema = {
  enabled: { kind: 'bool', label: 'Arp', default: false, randomize: false },
  rateMode: {
    kind: 'enum',
    label: 'Rate mode',
    group: 'Rhythm',
    options: ['sync', 'ms'],
    default: 'sync',
    randomize: false,
    hint: 'Sync: musical divisions at the arp tempo. ms: a fixed step time.',
  },
  tempo: {
    kind: 'number',
    label: 'Tempo',
    group: 'Rhythm',
    min: 40,
    max: 300,
    step: 1,
    default: 140,
    randomRange: [100, 200],
  },
  division: { kind: 'enum', label: 'Division', group: 'Rhythm', options: DIVISIONS, default: '1/16' },
  rateMs: {
    kind: 'number',
    label: 'Step time',
    group: 'Rhythm',
    min: 10,
    max: 1000,
    default: 60,
    curve: 'log',
    unit: 'ms',
    randomRange: [25, 150],
  },
  steps: {
    kind: 'number',
    label: 'Steps',
    group: 'Rhythm',
    min: 1,
    max: 64,
    step: 1,
    default: 8,
    randomRange: [2, 12],
    hint: 'Total steps played for one note, across all lanes.',
  },
  swing: {
    kind: 'number',
    label: 'Swing',
    group: 'Rhythm',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    unit: '%',
    randomRange: [0, 40],
    hint: 'Delays every second step. 100% is a full triplet shuffle.',
  },
  direction: { kind: 'enum', label: 'Direction', group: 'Rhythm', options: DIRECTIONS, default: 'forward' },
  polymeter: {
    kind: 'bool',
    label: 'Polymeter',
    group: 'Rhythm',
    default: false,
    hint: 'On: each lane wraps at its own length. Off: every lane follows the pitch lane length.',
  },
  pitch: lane('Pitch', -24, 24, [0, 4, 7, 12], 1),
  pitchLength: laneLength('Pitch', 4),
  velocity: { ...lane('Velocity', 0, 1, [1, 0.75], 0.01), hint: 'A step at 0 is a rest.' },
  velocityLength: laneLength('Velocity', 4),
  pan: lane('Pan', -1, 1, [0], 0.01),
  panLength: laneLength('Pan', 4),
  repeats: { ...lane('Repeats', 1, 4, [1], 1), hint: 'Ratchets: the step is split into this many hits.' },
  repeatsLength: laneLength('Repeats', 4),
  gate: {
    ...lane('Note length', 0, 1, [0.75], 0.01),
    hint: 'Fraction of the step (or ratchet) the note is held.',
  },
  gateLength: laneLength('Note length', 4),
} satisfies ParamSchema;
