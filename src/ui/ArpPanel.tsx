import { registry } from '../modules';
import { actions, patch } from '../state/store';
import { SchemaPanel } from './SchemaPanel';

/** Arpeggiator: its `enabled` param is the header switch, everything else is generated. */
export function ArpPanel() {
  const arp = patch.value.arp;
  const enabled = arp.enabled === true;
  return (
    <section class={`panel arp${enabled ? '' : ' off'}`} aria-label="Arpeggiator">
      <div class="panel-head">
        <label class="toggle" title="Arpeggiator on/off">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            aria-label="Arpeggiator enabled"
            onChange={(e) => actions.setArpParam('enabled', e.currentTarget.checked)}
          />
          <span class="toggle-track" aria-hidden="true" />
        </label>
        <h2>Arpeggiator</h2>
        <span class="spacer" />
        <button
          type="button"
          class="btn"
          onClick={() => actions.randomizeArp()}
          title="Randomise the arpeggiator"
        >
          Randomise
        </button>
      </div>
      <SchemaPanel
        idPrefix="arp"
        schema={registry.arp.schema}
        params={arp}
        exclude={['enabled']}
        onChange={(k, v) => actions.setArpParam(k, v)}
      />
    </section>
  );
}
