import type { NumberParam } from '../core';
import { ExportButton } from '../export';
import { PresetBar } from '../presets';
import { actions, patch } from '../state/store';
import { meter } from './playback';
import { notify } from './Toast';
import { Scrub } from './widgets';

const masterSpec: NumberParam = {
  kind: 'number',
  label: 'Master',
  min: -60,
  max: 6,
  default: 0,
  unit: 'dB',
};

const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`;

/** Thin output meter along the bottom of the master control; turns red near clipping. */
function MasterMeter() {
  const db = meter.value > 0 ? 20 * Math.log10(meter.value) : -60;
  const w = Math.min(1, Math.max(0, (db + 48) / 48)) * 100;
  return <div class={`master-meter${db > -1 ? ' hot' : ''}`} style={{ width: `${w}%` }} aria-hidden="true" />;
}

/** Top bar: logo, preset bar, randomise, master level and export. */
export function Header() {
  return (
    <header class="top">
      <div class="brand">
        <img src={logoUrl} alt="" width={28} height={28} />
        <h1>OpenClick</h1>
      </div>
      <PresetBar notify={notify} />
      <span class="spacer" />
      <div class="top-random">
        <button
          type="button"
          class="btn"
          title="Nudge every module a little"
          onClick={() => actions.randomizeAll(0.25)}
        >
          Mutate
        </button>
        <button
          type="button"
          class="btn"
          title="Randomise every layer, effect and the arp"
          onClick={() => actions.randomizeAll()}
        >
          <span class="die" aria-hidden="true">
            ⚄
          </span>
          Randomise all
        </button>
      </div>
      <div class="master">
        <Scrub
          id="master-gain"
          spec={masterSpec}
          value={patch.value.master.gain}
          onChange={(v) => actions.setMasterGain(v)}
          color="#2b2d34"
        >
          <MasterMeter />
        </Scrub>
      </div>
      <ExportButton notify={notify} />
    </header>
  );
}
