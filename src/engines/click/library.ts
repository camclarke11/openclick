import manifestJson from './manifest.json';

/**
 * The Click sample library, read from `manifest.json` (written by scripts/samples/generate.ts;
 * the audio files live in public/samples/). To swap in the real recorded library, replace the
 * files under public/samples/ and this manifest; nothing else needs to change. Presets refer to
 * sounds by `Category/Name`, so keep names stable once presets use them.
 */
export interface SampleManifest {
  format: 'openclick-samples';
  version: number;
  name: string;
  /** True while the library is synthesised stand-ins rather than recordings. */
  placeholder: boolean;
  license: string;
  categories: {
    id: string;
    name: string;
    sounds: {
      id: string;
      name: string;
      placeholder: boolean;
      /** A URL for third-party (CC0) audio, or how the sound was made. */
      source: string;
      license: string;
      /** Round robin variations, paths relative to public/samples/. Also the asset ids. */
      files: string[];
    }[];
  }[];
}

export interface LibrarySound {
  /** `Category/Name`, the value stored in patches. */
  key: string;
  category: string;
  name: string;
  placeholder: boolean;
  files: string[];
}

export function readManifest(manifest: SampleManifest): LibrarySound[] {
  const sounds: LibrarySound[] = [];
  for (const cat of manifest.categories) {
    for (const s of cat.sounds) {
      if (s.files.length === 0) continue;
      sounds.push({
        key: `${cat.name}/${s.name}`,
        category: cat.name,
        name: s.name,
        placeholder: manifest.placeholder || s.placeholder,
        files: s.files,
      });
    }
  }
  return sounds;
}

export const manifest = manifestJson as SampleManifest;
export const library = readManifest(manifest);
const byKey = new Map(library.map((s) => [s.key, s]));

export const findSound = (key: string): LibrarySound | undefined => byKey.get(key);
