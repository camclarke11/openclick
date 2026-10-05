import type { ParamSpec, ParamValue, StepsParam } from '../core';
import { registry } from '../modules';
import { actions, patch } from '../state/store';
import { groupSchema } from './controls';
import { Knob } from './Knob';
import { formatValue } from './controls';
import { StepLane } from './StepLane';
import { layerColor, moduleGroup, selectedLayer } from './uiState';
import { Segmented, Switch } from './widgets';

/** The handful of params that shape most sounds, shown first so the panel isn't a wall of knobs. */
export const ESSENTIALS: Record<string, readonly string[]> = {
  beep: [
    'shape',
    'coarse',
    'sweep',
    'sweepTime',
    'fmIndex',
    'noiseLevel',
    'cutoff',
    'resonance',
    'attack',
    'decay',
    'release',
    'speaker',
  ],
  click: ['sound', 'pitch', 'humanize', 'start', 'length', 'fade', 'filter', 'cutoff'],
};

/** Enums with more options than this get a dropdown instead of a segmented control. */
const MAX_SEGMENTS = 6;

function Control(props: {
  id: string;
  spec: ParamSpec;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  const { id, spec, value, onChange } = props;
  switch (spec.kind) {
    case 'number':
      return (
        <div class="knob-cell" title={spec.hint}>
          <Knob id={id} spec={spec} value={value as number} onChange={onChange} />
          <output for={id} class="mono">
            {formatValue(spec, value as number)}
          </output>
          <span class="knob-label">{spec.label}</span>
        </div>
      );
    case 'enum':
      return (
        <div class="switch-cell" title={spec.hint}>
          <span class="field-label">{spec.label}</span>
          {spec.options.length > MAX_SEGMENTS ? (
            <select
              id={id}
              aria-label={spec.label}
              value={value as string}
              onChange={(e) => onChange(e.currentTarget.value)}
            >
              {spec.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <Segmented
              label={spec.label}
              options={spec.options}
              value={value as string}
              onChange={onChange}
            />
          )}
        </div>
      );
    case 'bool':
      return (
        <div class="switch-cell toggle-cell">
          <Switch
            on={value as boolean}
            label={spec.label}
            text={spec.label}
            title={spec.hint}
            onChange={onChange}
          />
        </div>
      );
    case 'steps':
      return null;
  }
}

/** Parameters of the selected layer's source, grouped into tabs with an Essentials tab first. */
export function ModulePanel() {
  const layers = patch.value.layers;
  const sel = Math.min(selectedLayer.value, layers.length - 1);
  const layer = layers[sel]!;
  const mod = registry.sources.get(layer.source)!;
  const schema = mod.schema;
  const groups = groupSchema(schema).filter((g) => g.name);
  const essentials = (ESSENTIALS[layer.source] ?? []).filter((k) => k in schema);
  const tabs = [...(essentials.length ? ['Essentials'] : []), ...groups.map((g) => g.name)];
  const group = tabs.includes(moduleGroup.value) ? moduleGroup.value : tabs[0]!;
  const keys = group === 'Essentials' ? essentials : (groups.find((g) => g.name === group)?.keys ?? []);
  const color = layerColor(sel);

  const switches = keys.filter((k) => schema[k]!.kind === 'enum' || schema[k]!.kind === 'bool');
  const knobs = keys.filter((k) => schema[k]!.kind === 'number');
  const lanes = keys.filter((k) => schema[k]!.kind === 'steps');
  const set = (k: string) => (v: ParamValue) => actions.setLayerParam(sel, k, v);
  const id = (k: string) => `l${sel}-${k}`;

  return (
    <section
      id="module-panel"
      class="module"
      role="tabpanel"
      aria-labelledby={`layer-tab-${sel}`}
      aria-label={`${mod.label} parameters`}
      style={{ '--lc': color }}
    >
      <div class="module-head">
        <h2 class="module-title">
          <span class="dot" aria-hidden="true" />
          {mod.label} · Layer {sel + 1}
        </h2>
        <div class="module-tabs" role="group" aria-label="Parameter groups">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={t === group}
              class={t === group ? 'on' : ''}
              onClick={() => (moduleGroup.value = t)}
            >
              {t}
            </button>
          ))}
        </div>
        <button type="button" class="btn small" onClick={() => actions.randomizeLayer(sel)}>
          <span class="die" aria-hidden="true">
            ⚄
          </span>
          Randomise
        </button>
      </div>
      <div class="module-body" key={`${sel}-${layer.source}`}>
        {switches.length > 0 && (
          <div class="module-switches">
            {switches.map((k) => (
              <Control key={k} id={id(k)} spec={schema[k]!} value={layer.params[k]!} onChange={set(k)} />
            ))}
          </div>
        )}
        {knobs.length > 0 && (
          <div class="module-knobs">
            {knobs.map((k) => (
              <Control key={k} id={id(k)} spec={schema[k]!} value={layer.params[k]!} onChange={set(k)} />
            ))}
          </div>
        )}
        {lanes.map((k) => {
          const spec = schema[k] as StepsParam;
          const len = Number(layer.params.seqLength ?? spec.length);
          return (
            <div key={k} class="module-lane">
              <span class="field-label">Steps · semitones · click or drag to draw</span>
              <StepLane
                id={id(k)}
                spec={spec}
                value={layer.params[k] as number[]}
                activeLength={len}
                text="signed"
                color={color}
                onChange={set(k)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
