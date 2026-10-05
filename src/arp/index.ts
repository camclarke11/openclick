import type { ArpModule, ParamSchema } from '../core';

/**
 * Five-lane arpeggiator. FOUNDATION STUB: passthrough. The Layers & Arp workstream replaces
 * this with pitch, velocity, pan, repeats and note-length lanes (see docs/PLAN.md).
 */
const schema = {
  enabled: { kind: 'bool', label: 'Arp', default: false, randomize: false },
} satisfies ParamSchema;

export const arp: ArpModule = {
  schema,
  expand: (_params, ev) => [ev],
};
