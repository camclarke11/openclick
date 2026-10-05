import type { ParamSpec, ParamValue } from '../core';

/**
 * Generic control generated from a param spec. FOUNDATION: plain inputs. The UI workstream
 * restyles these (knobs, step editors) keeping the same props.
 */
export function ParamControl(props: {
  id: string;
  spec: ParamSpec;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  const { id, spec, value, onChange } = props;
  const label = (
    <label for={id} title={spec.hint}>
      {spec.label}
    </label>
  );
  switch (spec.kind) {
    case 'number':
      return (
        <div class="param">
          {label}
          <input
            id={id}
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step ?? (spec.max - spec.min) / 1000}
            value={value as number}
            onInput={(e) => onChange(Number(e.currentTarget.value))}
          />
          <output>
            {(value as number).toFixed(spec.step && spec.step >= 1 ? 0 : 3)}
            {spec.unit ? ` ${spec.unit}` : ''}
          </output>
        </div>
      );
    case 'enum':
      return (
        <div class="param">
          {label}
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
        <div class="param">
          {label}
          <input
            id={id}
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(e.currentTarget.checked)}
          />
        </div>
      );
    case 'steps':
      return (
        <div class="param">
          {label}
          <span>{(value as number[]).join(' ')}</span>
        </div>
      );
  }
}
