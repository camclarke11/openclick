# OpenClick

A free, browser-based sound design tool for interface, foley and video game sounds. Nothing to install and no DAW needed. Live at [sounds.camlc.dev](https://sounds.camlc.dev).

UVI Click is a $149 instrument that only runs inside UVI's own player in a DAW. OpenClick is our own take on it that runs entirely in the browser, aiming to match Click's depth as a free or low-cost tool built on a sound library we recorded ourselves. The goal is to get a designer from idea to a usable sound in under a minute.

## Engines

- **Click**: plays our library of recorded mechanical sounds (switches, keyboards, cameras, toys, control panels) with pitch, start offset and round robins.
- **Beep**: synthesises tones with a variable-shape oscillator, FM, noise, pitch sweeps, speaker emulation and a step sequencer.

## Features

- Up to four stacked layers
- Five-lane arpeggiator: pitch, velocity, pan, repeats and note length
- Effects chain: EQ, delay, reverb, chorus, dispersion, granulizer, bitcrusher
- One-click randomise on every module
- Presets by category, including game sounds (jumps, coins, power-ups, lasers, hits, explosions, menu blips), from retro chiptune to modern
- Play from on-screen pads, the computer keyboard or a MIDI controller
- Export WAVs to drop into any project or game engine

## Project layout

```
src/engines/click   sample playback engine
src/engines/beep    synthesis engine
src/fx              effects chain
src/ui              interface
public/samples      recorded sound library
presets             preset definitions
docs                design notes
```

## Status

Early development.
