import { bus } from '../core';
import { registry } from '../modules';
import { ExportButton } from '../export';
import { PresetBrowser } from '../presets';
import { actions, patch } from '../state/store';
import { ParamControl } from './ParamControl';

/**
 * FOUNDATION SHELL: one layer editor and one pad, proving the audio path end to end. The UI
 * workstream replaces this with the full layout (see docs/PLAN.md).
 */
export function App() {
  const p = patch.value;
  return (
    <main>
      <h1>OpenClick</h1>
      <PresetBrowser />
      <ExportButton />
      <button
        class="pad"
        onPointerDown={() => bus.emit('noteOn', { note: 72, velocity: 1, source: 'pad', padId: 0 })}
      >
        Play
      </button>
      {p.layers.map((layer, i) => {
        const mod = registry.sources.get(layer.source)!;
        return (
          <section key={i} class="layer">
            <h2>
              Layer {i + 1}{' '}
              <select value={layer.source} onChange={(e) => actions.setLayerSource(i, e.currentTarget.value)}>
                {[...registry.sources.values()].map((s) => (
                  <option key={s.type} value={s.type}>
                    {s.label}
                  </option>
                ))}
              </select>{' '}
              <button onClick={() => actions.randomizeLayer(i)}>Randomise</button>
            </h2>
            {Object.entries(mod.schema).map(([key, spec]) => (
              <ParamControl
                key={key}
                id={`l${i}-${key}`}
                spec={spec}
                value={layer.params[key]!}
                onChange={(v) => actions.setLayerParam(i, key, v)}
              />
            ))}
          </section>
        );
      })}
    </main>
  );
}
