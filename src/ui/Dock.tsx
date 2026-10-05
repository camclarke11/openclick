import { patch } from '../state/store';
import { ArpHeader, ArpPanel } from './ArpPanel';
import { FxChain } from './FxChain';
import { dockTab } from './uiState';

/** Bottom dock: Arpeggiator and Effects tabs. */
export function Dock() {
  const tab = dockTab.value;
  const arpOn = patch.value.arp.enabled === true;
  const tabs = [
    { id: 'arp' as const, label: 'Arpeggiator', badge: arpOn ? 'ON' : 'OFF', hot: arpOn },
    { id: 'fx' as const, label: 'Effects', badge: String(patch.value.fx.length), hot: false },
  ];
  return (
    <section class="dock" aria-label="Arpeggiator and effects">
      <div class="dock-bar">
        <div role="tablist" aria-label="Dock" class="dock-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`dock-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="dock-panel"
              class={tab === t.id ? 'on' : ''}
              onClick={() => (dockTab.value = t.id)}
            >
              {t.label}
              <span class={`badge mono${t.hot ? ' hot' : ''}`}>{t.badge}</span>
            </button>
          ))}
        </div>
        <span class="spacer" />
        {tab === 'arp' ? (
          <ArpHeader />
        ) : (
          <span class="muted dock-note">One serial chain, shared by all layers · drag cards to reorder</span>
        )}
      </div>
      <div id="dock-panel" role="tabpanel" aria-labelledby={`dock-tab-${tab}`} class="dock-panel">
        {tab === 'arp' ? <ArpPanel /> : <FxChain />}
      </div>
    </section>
  );
}
