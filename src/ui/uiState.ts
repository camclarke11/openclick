import { signal } from '@preact/signals';

/** Index of the layer shown in the module panel. Components clamp it to the layer count. */
export const selectedLayer = signal(0);

/** Parameter group tab shown in the module panel ('Essentials' or a schema group). */
export const moduleGroup = signal('Essentials');

/** Which tab the bottom dock shows. */
export const dockTab = signal<'arp' | 'fx'>('arp');

/** Colour per layer slot, used for the layer cards, module accents and knob arcs. */
export const LAYER_COLORS = [
  '#ff9f1c',
  'oklch(0.78 0.13 230)',
  'oklch(0.78 0.13 320)',
  'oklch(0.8 0.13 150)',
];

export const layerColor = (i: number): string => LAYER_COLORS[i % LAYER_COLORS.length]!;
