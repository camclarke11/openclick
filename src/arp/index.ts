import type { ArpModule } from '../core';
import { expandArp } from './expand';
import { arpSchema } from './schema';

/**
 * Five-lane arpeggiator: pitch, velocity, pan, repeats (ratchets) and note length, each a step
 * lane with its own length, plus rate, swing, direction and polymeter. See docs/PLAN.md (WS3).
 */
export const arp: ArpModule = {
  schema: arpSchema,
  expand: expandArp,
};

export { arpSchema, DIRECTIONS, DIVISIONS, LANES, MAX_STEPS } from './schema';
export { expandArp, lanePosition, stepSeconds } from './expand';
