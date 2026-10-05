import { registry } from '../modules';
import { loadPresetFiles } from './library';

/** Factory library: every JSON file in presets/ at the repo root, bundled at build time. */
export const factoryPresets = loadPresetFiles(
  registry,
  import.meta.glob('../../presets/*.json', { eager: true, import: 'default' }),
);
