# Placeholder sample library

The recorded OpenClick library does not exist yet. `generate.ts` synthesises stand-in mechanical
sounds (modal synthesis: decaying sine modes plus filtered noise bursts) so the Click engine has
something to play. Every sound is marked `"placeholder": true` in the manifest and is CC0. No
third-party or UVI audio is used.

```sh
node scripts/samples/generate.ts
```

writes mono 48 kHz 16-bit WAVs to `public/samples/<category>/<sound>-<take>.wav` (4 round robin
takes per sound) and the manifest to `src/engines/click/manifest.json`. The manifest lives in
`src/` because the engine bundles it to build its sound list, and Vite does not allow importing
JSON from `public/`. Output is deterministic; `generate.test.ts` fails if the committed files
drift from the script, so re-run it after changing a recipe.

## Dropping in the real library

Replace the files under `public/samples/` and `src/engines/click/manifest.json` (same format:
categories → sounds → `files`, paths relative to `public/samples/`). Set `placeholder` to
`false`, and give third-party CC0 sounds their source URL in `source`. Presets store sounds as
`Category/Name`, so keep names that presets already use. Then delete or retire `generate.ts`
and its drift test.

## CC0 sound packs

`import-packs.ts` adds real recordings alongside the placeholders: a curated selection from
Kenney's CC0 audio packs (Interface, UI, Impact, Digital, Sci-fi, RPG, Casino) and Juhani
Junkala's CC0 "512 Sound Effects (8-bit style)", plus Kenney's Voiceover Pack and Music Jingles. They make up the UI, Retro, Impacts, Footsteps,
Sci-fi, Items, Voice and Jingles categories, picked for game sound effects (Roblox in particular).

```sh
node scripts/samples/import-packs.ts [cacheDir]
```

downloads the zips into `cacheDir` (default `.cache/packs`, git-ignored), then uses ffmpeg to
write trimmed, peak-normalised mono 48 kHz 16-bit WAVs to `public/samples/<category>/` and the
manifest to `src/engines/click/packs.json`. Each sound keeps its pack URL in `source` and the
original file names in `credit`. Edit `SELECTION` in the script to change what is imported, then
re-run it; `import-packs.test.ts` fails if the committed manifest drifts. Only add packs whose
licence allows redistribution (CC0): the repository and site are public.
