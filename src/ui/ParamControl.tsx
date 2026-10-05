import type { ParamSpec, ParamValue } from '../core';
import { formatValue } from './controls';
import { Knob } from './Knob';
import { StepLane } from './StepLane';

/** A control generated from a param spec: knob, select, toggle or step lane. */
export function ParamControl(props: {
  id: string;
  spec: ParamSpec;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
  /** Step lanes only: omit the visible label (it stays as the accessible name). */
  hideLabel?: boolean;
}) {
  const { id, spec, value, onChange } = props;
  switch (spec.kind) {
    case 'number':
      return (
        <div class="param param-knob">
          <Knob id={id} spec={spec} value={value as number} onChange={onChange} />
          <span class="param-label" title={spec.hint}>
            {spec.label}
          </span>
          <output for={id}>{formatValue(spec, value as number)}</output>
        </div>
      );
    case 'enum':
      return (
        <div class="param param-select">
          <label for={id} class="param-label" title={spec.hint}>
            {spec.label}
          </label>
          <select id={id} value={value as string} onChange={(e) => onChange(e.currentTarget.value)}>
            {spec.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case 'bool':
      return (
        <div class="param param-toggle">
          <label class="toggle" title={spec.hint}>
            <input
              id={id}
              type="checkbox"
              role="switch"
              checked={value as boolean}
              onChange={(e) => onChange(e.currentTarget.checked)}
            />
            <span class="toggle-track" aria-hidden="true" />
            <span class="param-label">{spec.label}</span>
          </label>
        </div>
      );
    case 'steps':
      return (
        <div class="param param-steps">
          {!props.hideLabel && (
            <span class="param-label" title={spec.hint}>
              {spec.label}
            </span>
          )}
          <StepLane id={id} spec={spec} value={value as number[]} onChange={onChange} />
        </div>
      );
  }
}
