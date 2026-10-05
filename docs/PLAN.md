# Sounds build plan

Sounds (formerly OpenClick) is a browser-based sound design tool for UI, foley and game sounds, deployed as a static
site at **sounds.camlc.dev**. This document fixes the stack and architecture, and splits the
remaining work into workstreams that can be built in parallel without stepping on each other.

## 1. Stack

| Concern | Choice                                                     | Why                                                                                                  |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Build   | Vite 8 + TypeScript (strict)                               | Fast dev server, first-class worklet bundling (`?worker&url`)                                        |
| UI      | Preact 11 + `@preact/signals`                              | ~10 KB, React-style components, signals keep audio params off the render hot path                    |
| Audio   | Web Audio API, AudioWorklets where native nodes fall short | Runs everywhere, same graph renders live and offline                                                 |
| Tests   | Vitest + `node-web-audio-api`                              | Real offline audio rendering in Node, so engines and effects are tested on actual samples, not mocks |
| E2E     | Playwright (Chromium)                                      | Smoke test that the built app loads and makes sound                                                  |
| Lint    | ESLint (typescript-eslint) + Prettier                      | `npm run lint` checks both                                                                           |
| CI      | GitHub Actions (`.github/workflows/ci.yml`)                | typecheck, lint, unit tests, build, e2e on every PR and on main                                      |
| Hosting | Static `dist/` (GitHub Pages by default)                   | No backend needed; see workstream 7                                                                  |

`npm run check` runs everything CI runs except e2e. `npm run e2e` runs the Playwright smoke test.

## 2. Architecture

```
            pads / computer keyboard / MIDI / tests
                          │  bus.emit('noteOn', {note, velocity, source})
                          ▼
   ┌──────────── Engine (realtime AudioContext) ─────────────┐
   │ SoundGraph(patch)                                        │       renderPatch(patch)
   │   arp.expand(note) → NoteEvent[]                         │  ◄──  same SoundGraph in an
   │   for each enabled layer (≤4): source.createVoice(ev)    │       OfflineAudioContext → WAV
   │   voice → [voice pan] → layer gain → layer pan           │
   │        → fx 1 → … → fx n → master gain                   │
   └──────────────────────── → limiter → analyser → speakers ┘
```

Everything lives behind the public API in `src/core/index.ts`. Lint forbids importing core
internals from outside core.

### 2.1 Parameters (`src/core/params.ts`)

Every module describes its parameters with a declarative `ParamSchema`: `number` (min, max,
default, step, `lin`/`log` curve, unit, optional narrower `randomRange`), `enum`, `bool`, and
`steps` (fixed-length numeric lane, for the Beep step sequencer and arp lanes). Specs carry a
`label`, a `group` (panel section), a `hint` and `randomize: false` to exclude a param from
randomise.

From the schema alone we get: `defaultParams`, `sanitizeParams` (clamp, fill, drop unknown),
`randomizeParams(schema, current, rng, amount)` (amount < 1 = "mutate"), and
`fromNormalized`/`toNormalized` for knobs. **The UI is generated from schemas**, so engine and
effect workstreams never need to write UI; they write good schemas.

All randomness goes through `createRng(seed)` so tests and exports are reproducible.

### 2.2 Modules (`src/core/types.ts`)

- **`SourceModule`** (Beep, Click): `schema`, optional async `prepare(params, ctx, assets)`, and
  `createVoice({ctx, output, rng, assets}, params, ev) → Voice`. A voice schedules everything
  for one `NoteEvent` (note, velocity, time, gate, pan) and reports `endTime`; optional
  `stop(time)` for panic. Sounds are one-shots: gate length comes from the arp or the default
  0.25 s, not from how long a key is held.
- **`EffectModule`**: `schema`, `tail(params)` seconds, optional `prepare(ctx)` (worklets), and
  `create(ctx, params, rng) → {input, output, update(params), dispose()}`. `update` must apply
  param changes without rebuilding, so reverb tails survive knob moves.
- **`ArpModule`**: `schema` (must include `enabled: bool`) and pure
  `expand(params, ev, rng) → NoteEvent[]`.
- **`Registry`**: built once in `src/modules.ts` from each workstream's `index` export. That
  file is pre-wired and should not need edits.
- **`AssetStore`**: `get(id)` / `load(ids, ctx)` for decoded sample buffers;
  `createAssetStore(resolveUrl)` fetches from `public/samples/`.
- **`loadWorklet(ctx, url)`**: adds an AudioWorklet module once per context. Get the URL with
  `import url from './proc.worklet.ts?worker&url'`. The first workstream to ship a worklet
  should confirm this bundles correctly in `npm run build` and note anything surprising here.

### 2.3 Patch and preset schema (`src/core/patch.ts`)

```ts
Patch  = { layers: LayerSpec[1..4], arp: Params, fx: FxSlot[], master: { gain: dB } }
LayerSpec = { enabled, source: 'beep' | 'click', mix: {gain dB, pan, transpose st, delay ms}, params }
FxSlot = { type, enabled, params }        // one serial chain shared by all layers
Preset = { format: 'openclick-preset', version: 1, id, name, category, tags[], author?, patch }
```

`sanitizePatch` / `parsePreset` make any JSON valid for the current registry (unknown sources
and effects dropped, params clamped and defaulted), so presets survive schema changes. If a
change needs a real migration, bump `PRESET_VERSION` and migrate in `parsePreset`.

**Preset categories** (use exactly these so the browser can group them):

- `UI/Click`, `UI/Tap`, `UI/Toggle`, `UI/Hover`, `UI/Swipe`, `UI/Notification`, `UI/Success`, `UI/Error`
- `Foley/Switch`, `Foley/Keyboard`, `Foley/Camera`, `Foley/Toy`, `Foley/Mechanism`
- `Game/Jump`, `Game/Coin`, `Game/Power-up`, `Game/Laser`, `Game/Hit`, `Game/Explosion`, `Game/Menu`, `Game/Pickup`

Style goes in `tags`: `retro`, `chiptune`, `8-bit`, `modern`, `soft`, `harsh`, `short`, `long`,
and `roblox` for presets made for Roblox games.

### 2.4 Events (`src/core/bus.ts`)

`bus.emit('noteOn' | 'noteOff' | 'panic', …)`. Inputs only ever emit on the bus; the engine
subscribes in `src/state/store.ts`. `source` says where a note came from and `padId` lets pads
light up.

### 2.5 State (`src/state/store.ts`)

One `patch` signal holding an immutable `Patch`, plus `currentPreset`. All edits go through
`actions` (layers, mix, arp, fx add/remove/move/params, master, randomise per module and all,
`loadPreset`). The engine follows the signal. If a workstream needs a new action, add it in a
small separate PR (see rules below).

### 2.6 Testing

- Unit tests sit next to code as `*.test.ts`.
- `src/test/audio.ts` provides `renderForTest(registry, patch)`, which renders real audio in Node.
  Engines and effects should assert on output: non-silent, peak ≤ 1, expected length, expected
  pitch/spectral change where cheap to check, deterministic with a fixed seed.
- AudioWorklets do not run in Node tests. Keep DSP in plain functions (`process(input, params)`)
  that the worklet calls, and unit-test those functions directly.
- `e2e/smoke.spec.ts` must keep passing: the page loads and the pad starts audio without errors.

## 3. Rules for parallel work

1. **Stay in your directories** (table below). Each workstream replaces the stub in its own
   directory; `src/modules.ts` already imports it.
2. **Shared files** (`src/core/**`, `src/state/**`, `src/modules.ts`, `src/test/**`, configs,
   `ci.yml`, this plan) change only in small, separate PRs that say "core change" in the title,
   keep backwards compatibility where possible, and merge quickly. Rebase on main before
   merging anything.
3. One branch and PR per workstream (more is fine for big ones). CI must be green. Merge to
   `main` with a merge commit or squash; never force-push main.
4. Do not edit another workstream's directory. If you need something from it, ask through the
   coordinator, or add a stub-compatible extension point in core.
5. Keep the app working at every merge: `npm run check && npm run e2e`.

| Workstream                   | Owns                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------- |
| 0 Foundation (done)          | `src/core`, `src/state`, `src/modules.ts`, `src/test`, configs, CI           |
| 1 Beep engine                | `src/engines/beep/**`                                                        |
| 2 Click engine + samples     | `src/engines/click/**`, `public/samples/**`, `scripts/samples/**`            |
| 3 Arpeggiator                | `src/arp/**`                                                                 |
| 4 Effects chain              | `src/fx/**`                                                                  |
| 5 UI shell and input         | `src/ui/**`, `src/input/**`, `src/main.tsx`, `index.html`, `e2e/**`          |
| 6 Presets, randomise, export | `presets/**`, `src/presets/**`, `src/export/**`                              |
| 7 Deployment                 | `.github/workflows/deploy.yml`, `public/` (except samples), `docs/DEPLOY.md` |

Workstreams 1–5 and 7 can start immediately. Workstream 6 can start immediately on export and
the preset browser, and should author the factory preset library after 1, 2 and 4 merge (it will
need their final schemas).

## 4. Workstream briefs

Each brief is self-contained: hand it to a new thread as-is. Every thread should read
`CLAUDE.md` and this plan first.

### WS1 Beep engine

Build the synth source in `src/engines/beep/` (replace the stub `beepSource`, keep the export
name and `type: 'beep'`). Features, matching UVI Click's Beep module:

- **Variable-shape oscillator**: continuous morph sine → triangle → saw → square → pulse with
  pulse width. Use a `PeriodicWave` table set or an AudioWorklet (band-limited, e.g. PolyBLEP).
- **FM**: modulator with ratio, index (amount) and its own decay envelope.
- **Noise generator**: white/pink/"chip" (LFSR, 1-bit), level and filter, mixable with the osc.
- **Pitch sweeps**: start offset (st), sweep curve (lin/exp), time; plus a pitch envelope
  (attack/decay depth) and optional vibrato.
- **Amp envelope**: AHDSR scaled to gate; velocity → level and optionally brightness.
- **Speaker emulation**: models of small speakers (phone, laptop, tiny piezo, game handheld,
  TV): band-limiting filters, resonances and soft clipping. Enum + amount.
- **Step sequencer**: a `steps` param lane (16 steps of semitone offsets) with rate, length and
  on/off, retriggering or gliding the oscillator within one voice so retro arpeggio blips
  ("coin", "power-up") come from a single note.
- Good `group`s and `randomRange`s so one-click randomise gives usable sounds most of the time.

Tests with `renderForTest`: each wave shape renders non-silent and ≤ 0 dBFS, sweeps change pitch
direction (zero-crossing count early vs late), sequencer produces distinct segments, a fixed
seed is deterministic. Keep worklet DSP in testable plain functions.

### WS2 Click engine and placeholder sample library

Build the sample source in `src/engines/click/` (replace the stub `clickSource`, keep the export
name and `type: 'click'`) and a placeholder library in `public/samples/`.

- **The real recorded library does not exist yet.** Generate placeholders with a script in
  `scripts/samples/` that synthesises mechanical sounds offline (switch clicks, key presses,
  camera shutters, toy squeaks, control-panel buttons) using `node-web-audio-api`, writes WAVs
  (mono, 48 kHz, 16-bit) and a `public/samples/manifest.json`. Commit the generated files, keep
  the total small (target < 5 MB), and label every one as placeholder in the manifest. Only use
  third-party audio if it is CC0, and record source URLs in the manifest. Do not use any UVI
  content.
- Manifest: categories (Switches, Keyboards, Cameras, Toys, Control panels) → sounds → round
  robin variations (files). Design it so the real library can be dropped in later by replacing
  files and manifest only.
- Params: category and sound selection (enum built from the manifest at module load, or a
  numeric index; your call, but it must sanitise and randomise sensibly), pitch (st + fine),
  start offset, length/fade, reverse, round robin mode (cycle/random/fixed), amp envelope,
  filter, velocity sensitivity.
- `prepare` loads only the files the patch needs via `assets.load`. A voice whose buffer is not
  loaded yet plays silently and never throws.

Tests: the generator script produces valid WAVs and manifest; the source plays a loaded
buffer (inject buffers with `createMemoryAssetStore`), pitch changes length, round robins
cycle, unknown ids are silent.

### WS3 Arpeggiator

Replace the passthrough in `src/arp/index.ts` with the five-lane arpeggiator (keep export name
`arp`, keep the `enabled` param).

- Five `steps` lanes, each up to 16 steps with its own length: **pitch** (semitones),
  **velocity** (0–1), **pan** (−1…1), **repeats** (ratchets per step, 1–4) and **note length**
  (gate fraction).
- Global: rate (note division or ms), number of steps/cycles to play, swing, direction
  (forward, reverse, ping-pong, random), and a lane-length-independent polymeter mode.
- `expand` is pure: turn one `NoteEvent` into the timed list. It must be cheap; it runs on every
  pad hit.
- Check layer stacking works musically with the arp (each layer plays the expanded events with
  its transpose and offset; this is done in core's `SoundGraph.trigger`). If something needs to
  change in core, do it as a separate small "core change" PR.

Tests: lane values map onto events, polymeter lengths wrap independently, repeats subdivide,
directions order correctly, deterministic with a seed.

### WS4 Effects chain

Implement the effects in `src/fx/`, one file (or folder) per effect, exported as the
`effects` array in `src/fx/index.ts` in menu order: **EQ** (3–4 band with low/high shelf and
peaking), **Delay** (time in ms or sync-free, feedback, filter, ping-pong, mix), **Reverb**
(algorithmic or generated-IR convolution, size, decay, pre-delay, damping, mix), **Chorus**
(rate, depth, voices, mix), **Dispersion** (all-pass chain that smears transients into "zap"
chirps), **Granulizer** (grain size, density, pitch/position jitter, mix; AudioWorklet), and
**Bitcrusher** (bit depth, sample-rate reduction, mix; AudioWorklet).

- Each is an `EffectModule` with `tail(params)` accurate enough for export trimming and an
  `update` that does not rebuild nodes (no clicks or lost tails while tweaking).
- Every effect has a wet/dry mix; defaults should be tasteful, and `randomRange`s should avoid
  extreme settings.
- Worklet DSP lives in plain functions that are unit-tested in Node.

Tests: each effect passes signal at mix 0, changes it at mix 1, reports a sensible tail,
`update` changes output without throwing, no NaNs or peaks > 1 for default settings.

### WS5 UI shell and input

Replace the foundation shell in `src/ui/` with the real interface, and build inputs in
`src/input/`.

- Layout: top bar (preset browser mount `<PresetBrowser/>`, randomise-all, export mount
  `<ExportButton/>`, master level, output meter/scope from `engine.analyser`), a layer strip
  (up to four layers: add/remove, source select, enable, mix controls, per-layer randomise), the
  selected layer's module panel, the arp panel, and the fx chain (add from `registry.effects`,
  reorder by drag, bypass, remove, per-effect randomise).
- **Controls are generated from schemas** via `ParamControl`: build a proper knob (drag,
  wheel, double-click to reset, shift for fine, keyboard accessible), slider, select, toggle and a
  step-lane editor for `steps` params. Group by `spec.group`.
- **Pads**: a 4×4 grid that plays the current patch at different pitches, with velocity from
  click position, multi-touch, and lights on `noteOn` with `padId`.
- **Computer keyboard**: two-row piano mapping (A–K white keys, W–U black keys), Z/X octave,
  Escape = panic; ignore keys while typing in inputs. Emit on `bus`.
- **MIDI**: Web MIDI input with device picker, note on/off, velocity, all-notes-off; degrade
  gracefully when Web MIDI is unavailable (Safari/Firefox).
- Responsive down to a phone, dark theme, no external UI kit needed.
- Keep `e2e/smoke.spec.ts` passing (update selectors if you rename the Play button) and add
  e2e checks for pads, keyboard and layer add/remove.

### WS6 Presets, randomise and WAV export

Fill in `src/presets/` and `src/export/` and author `presets/`.

- **WAV export** (`src/export/`): `encodeWav(RenderedAudio, {bitDepth: 16 | 24 | 32f})`,
  options for sample rate (44.1/48 kHz), mono/stereo, normalise, and file name from preset name.
  `ExportButton` renders the current patch with core's `renderPatch` (use the shared `assets`
  from `src/state/store.ts`) and downloads it. Also "export variations" (N renders with
  different seeds / round robins) as separate files or a zip.
- **Preset browser** (`src/presets/`): browse by category tree and tags, search, audition on
  hover/click, previous/next, save user presets to `localStorage`, import/export preset JSON
  files, mark modified. `PresetBrowser` is already mounted by the UI shell.
- **Factory presets** (`presets/*.json`, loaded into `factoryPresets`, e.g. via
  `import.meta.glob`): at least 3 per category listed in section 2.3, covering retro chiptune to
  modern. Author these after WS1, WS2 and WS4 merge so they use final schemas; until then, build
  and test the pipeline with a few presets on the stub schemas.
- **Smart randomise**: on top of the generic schema randomise in `actions`, add "generate a
  `<category>`" recipes (e.g. coin = square wave + upward 2-step sequence + short decay) that
  produce on-target sounds in one click. Expose them through the preset browser UI.

Tests: WAV header and samples round-trip, every factory preset parses with `parsePreset` and
renders non-silent with `renderForTest`, recipes produce valid patches.

### WS7 Deployment to sounds.camlc.dev

- Add `.github/workflows/deploy.yml` that builds on push to `main` and deploys `dist/` to
  GitHub Pages (default; repo is public). Add `public/CNAME` with `sounds.camlc.dev`.
- Write `docs/DEPLOY.md` with the one-time steps only Cam can do: enable Pages (source: GitHub
  Actions) in repo settings and add a DNS `CNAME sounds → camclarke11.github.io` at the
  camlc.dev DNS provider, then enforce HTTPS. If camlc.dev is on Cloudflare and Cloudflare
  Pages is preferred, document that alternative instead.
- Add favicon, web app manifest and social preview meta in `public/` and suggest any
  `index.html` head changes to WS5 (they own `index.html`).
- Cache headers: hashed assets are immutable; samples should be cacheable.
- Optional: PR preview deploys if cheap.

## 5. Definition of done

A designer opens sounds.camlc.dev, picks `Game/Coin`, hits a pad or a key, randomises a layer,
adds reverb and exports a trimmed WAV in under a minute, on desktop Chrome, Firefox and Safari
(MIDI where supported), with CI green on main.
