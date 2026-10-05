import type { EffectModule } from '../core';
import { bitcrusher } from './bitcrusher';
import { chorus } from './chorus';
import { delay } from './delay';
import { dispersion } from './dispersion';
import { eq } from './eq';
import { granulizer } from './granulizer';
import { reverb } from './reverb';

/** The effects chain catalogue, in the order the "add effect" menu shows them. */
export const effects: EffectModule[] = [eq, delay, reverb, chorus, dispersion, granulizer, bitcrusher];

export { bitcrusher, chorus, delay, dispersion, eq, granulizer, reverb };
