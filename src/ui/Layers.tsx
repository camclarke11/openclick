import { layerMixSchema, MAX_LAYERS, type NumberParam } from '../core';
import { registry } from '../modules';
import { actions, patch } from '../state/store';
import { layerColor, selectedLayer } from './uiState';
import { Segmented, Scrub, Switch } from './widgets';

const sourceLabel = (type: string) => registry.sources.get(type)?.label ?? type;
const sourceTypes = () => [...registry.sources.keys()];
const mixKeys = Object.keys(layerMixSchema) as (keyof typeof layerMixSchema)[];

/** Up to four layer cards: select, source, on/off, randomise, remove and the four mix scrubs. */
export function LayerCards() {
  const layers = patch.value.layers;
  const sel = Math.min(selectedLayer.value, layers.length - 1);

  const add = (source: string) => {
    actions.addLayer(source);
    selectedLayer.value = patch.value.layers.length - 1;
  };
  const remove = (i: number) => {
    actions.removeLayer(i);
    selectedLayer.value = Math.max(0, Math.min(sel, patch.value.layers.length - 1));
  };

  return (
    <div class="layers" role="tablist" aria-label="Layers">
      {layers.map((l, i) => {
        const color = layerColor(i);
        return (
          <div
            key={i}
            class={`layer-card${i === sel ? ' selected' : ''}${l.enabled ? '' : ' muted'}`}
            style={{ '--lc': color }}
            onClick={() => (selectedLayer.value = i)}
          >
            <div class="layer-head">
              <button
                type="button"
                role="tab"
                id={`layer-tab-${i}`}
                aria-selected={i === sel}
                aria-controls="module-panel"
                class="layer-title"
                onClick={() => (selectedLayer.value = i)}
              >
                <span class="dot" aria-hidden="true" />
                Layer {i + 1}
                <span class="visually-hidden"> {sourceLabel(l.source)}</span>
              </button>
              <Segmented
                label={`Layer ${i + 1} source`}
                options={sourceTypes()}
                value={l.source}
                render={sourceLabel}
                onChange={(src) => {
                  if (src !== l.source) actions.setLayerSource(i, src);
                  selectedLayer.value = i;
                }}
                class="small"
              />
              <span class="spacer" />
              <Switch
                small
                on={l.enabled}
                color={color}
                label={`Layer ${i + 1} enabled`}
                title="Layer on/off"
                onChange={(on) => actions.setLayerEnabled(i, on)}
              />
              <button
                type="button"
                class="icon-ghost die"
                aria-label={`Randomise layer ${i + 1}`}
                title="Randomise layer"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.randomizeLayer(i);
                }}
              >
                ⚄
              </button>
              {layers.length > 1 && (
                <button
                  type="button"
                  class="icon-ghost danger"
                  aria-label={`Remove layer ${i + 1}`}
                  title="Remove layer"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(i);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <div class="layer-mix">
              {mixKeys.map((k) => (
                <Scrub
                  key={k}
                  id={`l${i}-mix-${k}`}
                  spec={layerMixSchema[k] as NumberParam}
                  ariaLabel={
                    i === sel ? layerMixSchema[k].label : `Layer ${i + 1} ${layerMixSchema[k].label}`
                  }
                  value={l.mix[k] as number}
                  color={`color-mix(in oklch, ${color} 26%, transparent)`}
                  onChange={(v) => actions.setLayerMix(i, k, v)}
                />
              ))}
            </div>
          </div>
        );
      })}
      {layers.length < MAX_LAYERS && (
        <div class="layer-add">
          <span class="muted">Add layer</span>
          <div class="layer-add-row">
            {sourceTypes().map((t) => (
              <button
                key={t}
                type="button"
                class="btn"
                aria-label={`Add ${sourceLabel(t)} layer`}
                onClick={() => add(t)}
              >
                + {sourceLabel(t)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
