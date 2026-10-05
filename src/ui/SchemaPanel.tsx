import type { Params, ParamSchema, ParamValue } from '../core';
import { groupSchema } from './controls';
import { ParamControl } from './ParamControl';

/** Every param of a schema as generated controls, one block per `spec.group`. */
export function SchemaPanel(props: {
  idPrefix: string;
  schema: ParamSchema;
  params: Params;
  onChange: (key: string, v: ParamValue) => void;
  exclude?: readonly string[];
}) {
  const { idPrefix, schema, params, onChange, exclude } = props;
  const groups = groupSchema(schema, exclude);
  if (!groups.length) return <p class="empty">No parameters.</p>;
  return (
    <div class="schema-panel">
      {groups.map((g) => (
        <fieldset key={g.name} class="param-group">
          {g.name && <legend>{g.name}</legend>}
          <div class="param-grid">
            {g.keys.map((key) => (
              <ParamControl
                key={key}
                id={`${idPrefix}-${key}`}
                spec={schema[key]!}
                // A control that names its own group (Pitch in "Pitch") doesn't need the label twice.
                hideLabel={
                  schema[key]!.kind === 'steps' && schema[key]!.label.toLowerCase() === g.name.toLowerCase()
                }
                value={params[key]!}
                onChange={(v) => onChange(key, v)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
