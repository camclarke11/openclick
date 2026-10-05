import type { NumberParam } from '../core';
import { ExportButton } from '../export';
import { PresetBrowser } from '../presets';
import { actions, patch } from '../state/store';
import { ArpPanel } from './ArpPanel';
import { formatValue } from './controls';
import { FxChain } from './FxChain';
import { InputBar } from './InputBar';
import { Knob } from './Knob';
import { LayerStrip } from './Layers';
import { Pads } from './Pads';
import { Scope } from './Scope';

const masterSpec: NumberParam = {
  kind: 'number',
  label: 'Master',
  min: -60,
  max: 6,
  default: 0,
  unit: 'dB',
};

export function App() {
  const gain = patch.value.master.gain;
  return (
    <div class="app">
      <header class="topbar">
        <h1 class="logo">OpenClick</h1>
        <div class="topbar-presets">
          <PresetBrowser />
        </div>
        <button
          type="button"
          class="btn accent"
          onClick={() => actions.randomizeAll()}
          title="Randomise every module"
        >
          Randomise all
        </button>
        <ExportButton />
        <div class="master">
          <Knob
            id="master-gain"
            spec={masterSpec}
            value={gain}
            onChange={(v) => actions.setMasterGain(v)}
            size={36}
          />
          <span class="master-text">
            <span class="param-label">Master</span>
            <output for="master-gain">{formatValue(masterSpec, gain)}</output>
          </span>
        </div>
        <Scope />
      </header>

      <main class="workspace">
        <section class="panel play" aria-label="Play">
          <Pads />
          <InputBar />
          <p class="hint keys-hint">
            Keys <kbd>A</kbd>–<kbd>K</kbd> play, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd>{' '}
            <kbd>U</kbd> sharps, <kbd>Z</kbd>/<kbd>X</kbd> octave, <kbd>Esc</kbd> stop.
          </p>
        </section>
        <LayerStrip />
        <ArpPanel />
        <FxChain />
      </main>
    </div>
  );
}
