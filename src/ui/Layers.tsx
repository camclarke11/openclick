import { layerMixSchema, MAX_LAYERS } from '../core';
import { registry } from '../modules';
import { actions, patch } from '../state/store';
import { SchemaPanel } from './SchemaPanel';
import { selectedLayer } from './uiState';

const sources = () => [...registry.sources.values()];
const sourceLabel = (type: string) => registry.sources.get(type)?.label ?? type;

/** Up to four layers: tabs to select, add/remove, enable, source, mix and per-layer randomise. */
export function LayerStrip() {
  const layers = patch.value.layers;
  const sel = Math.min(selectedLayer.value, layers.length - 1);
  const layer = layers[sel]!;

  const add = () => {
    actions.addLayer(layers[layers.length - 1]?.source);
    selectedLayer.value = patch.value.layers.length - 1;
  };
  const remove = () => {
    actions.removeLayer(sel);
    selectedLayer.value = Math.max(0, sel - 1);
  };

  return (
    <section class="panel layers" aria-label="Layers">
      <div class="layer-tabs" role="tablist" aria-label="Layers">
        {layers.map((l, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            id={`layer-tab-${i}`}
            aria-selected={i === sel}
            aria-controls="layer-panel"
            class={`layer-tab${i === sel ? ' selected' : ''}${l.enabled ? '' : ' muted'}`}
            onClick={() => (selectedLayer.value = i)}
          >
            <span class="layer-tab-num">{i + 1}</span> {sourceLabel(l.source)}
          </button>
        ))}
        <button
          type="button"
          class="icon-btn add-layer"
          onClick={add}
          disabled={layers.length >= MAX_LAYERS}
          aria-label="Add layer"
          title={layers.length >= MAX_LAYERS ? `Up to ${MAX_LAYERS} layers` : 'Add layer'}
        >
          +
        </button>
      </div>

      <div id="layer-panel" role="tabpanel" aria-labelledby={`layer-tab-${sel}`} class="layer-panel">
        <div class="panel-head">
          <label class="toggle" title="Layer on/off">
            <input
              type="checkbox"
              role="switch"
              checked={layer.enabled}
              aria-label={`Layer ${sel + 1} enabled`}
              onChange={(e) => actions.setLayerEnabled(sel, e.currentTarget.checked)}
            />
            <span class="toggle-track" aria-hidden="true" />
          </label>
          <h2>Layer {sel + 1}</h2>
          <select
            aria-label={`Layer ${sel + 1} source`}
            value={layer.source}
            onChange={(e) => actions.setLayerSource(sel, e.currentTarget.value)}
          >
            {sources().map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </select>
          <span class="spacer" />
          <button
            type="button"
            class="btn"
            onClick={() => actions.randomizeLayer(sel)}
            title="Randomise this layer"
          >
            Randomise
          </button>
          <button
            type="button"
            class="btn"
            onClick={() => actions.randomizeLayer(sel, 0.25)}
            title="Nudge this layer a little"
          >
            Mutate
          </button>
          <button
            type="button"
            class="icon-btn"
            onClick={remove}
            disabled={layers.length <= 1}
            aria-label={`Remove layer ${sel + 1}`}
            title="Remove layer"
          >
            ×
          </button>
        </div>

        <div class="layer-mix">
          <SchemaPanel
            idPrefix={`l${sel}-mix`}
            schema={layerMixSchema}
            params={layer.mix}
            onChange={(k, v) => actions.setLayerMix(sel, k, v)}
          />
        </div>

        <div class="module-panel" aria-label={`${sourceLabel(layer.source)} parameters`}>
          <SchemaPanel
            // Keyed by source so controls reset cleanly when the source changes.
            key={`${sel}-${layer.source}`}
            idPrefix={`l${sel}`}
            schema={registry.sources.get(layer.source)!.schema}
            params={layer.params}
            onChange={(k, v) => actions.setLayerParam(sel, k, v)}
          />
        </div>
      </div>
    </section>
  );
}
