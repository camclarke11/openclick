import { signal } from '@preact/signals';

/** Index of the layer shown in the module panel. Components clamp it to the layer count. */
export const selectedLayer = signal(0);
