import type { NumberParam, StepsParam } from '../core';
import { DIRECTIONS, DIVISIONS, LANES, lanePosition } from '../arp';
import { registry } from '../modules';
import { actions, patch } from '../state/store';
import { arpStep } from './playback';
import { StepLane } from './StepLane';
import { Segmented, Scrub, Switch } from './widgets';

const DIRECTION_LABEL: Record<string, string> = {
  forward: '→ forward',
  reverse: '← reverse',
  'ping-pong': '↔ p-pong',
  random: '? random',
};

/** Arpeggiator header controls (on/off and randomise), shown in the dock's tab bar. */
export function ArpHeader() {
  const enabled = patch.value.arp.enabled === true;
  return (
    <div class="dock-tools">
      <Switch
        on={enabled}
        label="Arpeggiator enabled"
        text="Arp on"
        onChange={(on) => actions.setArpParam('enabled', on)}
      />
      <button
        type="button"
        class="btn small"
        title="Randomise the arpeggiator"
        onClick={() => {
          actions.randomizeArp();
          actions.setArpParam('enabled', true);
        }}
      >
        <span class="die" aria-hidden="true">
          ⚄
        </span>
        Randomise
      </button>
    </div>
  );
}

/** Rhythm settings on the left, the five step lanes on the right. */
export function ArpPanel() {
  const arp = patch.value.arp;
  const schema = registry.arp.schema;
  const enabled = arp.enabled === true;
  const poly = arp.polymeter === true;
  const direction = String(arp.direction);
  const step = arpStep.value;
  const scrubKeys = arp.rateMode === 'sync' ? ['tempo', 'steps', 'swing'] : ['rateMs', 'steps', 'swing'];

  return (
    <div class={`arp${enabled ? '' : ' off'}`} aria-label="Arpeggiator" role="group">
      <div class="arp-rhythm">
        <div class="arp-row" title={schema.rateMode!.hint}>
          <span class="field-label">Rate</span>
          <Segmented
            label="Rate mode"
            class="fill"
            options={['sync', 'ms']}
            value={String(arp.rateMode)}
            onChange={(v) => actions.setArpParam('rateMode', v)}
          />
        </div>
        {arp.rateMode === 'sync' && (
          <div class="arp-row">
            <span class="field-label">Division</span>
            <Segmented
              label="Division"
              class="fill"
              options={DIVISIONS}
              value={String(arp.division) as (typeof DIVISIONS)[number]}
              onChange={(v) => actions.setArpParam('division', v)}
            />
          </div>
        )}
        <div class="arp-row">
          <span class="field-label">Direction</span>
          <Segmented
            label="Direction"
            class="fill"
            options={DIRECTIONS}
            value={direction as (typeof DIRECTIONS)[number]}
            render={(o) => DIRECTION_LABEL[o] ?? o}
            onChange={(v) => actions.setArpParam('direction', v)}
          />
        </div>
        <div class="arp-scrubs">
          {scrubKeys.map((k) => (
            <Scrub
              key={k}
              id={`arp-${k}`}
              spec={schema[k] as NumberParam}
              value={arp[k] as number}
              onChange={(v) => actions.setArpParam(k, v)}
            />
          ))}
        </div>
        <Switch
          on={poly}
          label="Polymeter"
          text="Polymeter"
          title={schema.polymeter!.hint}
          onChange={(on) => actions.setArpParam('polymeter', on)}
        />
      </div>
      <div class="arp-lanes">
        {LANES.map((lane) => {
          const spec = schema[lane] as StepsParam;
          const lenKey = `${lane}Length`;
          const own = Number(arp[lenKey]);
          const len = poly || lane === 'pitch' ? own : Number(arp.pitchLength);
          const playing = step >= 0 && direction !== 'random' ? lanePosition(direction, step, len) : -1;
          return (
            <div key={lane} class="arp-lane">
              <div class="arp-lane-head">
                <span title={spec.hint}>{spec.label}</span>
                <div
                  class={`stepper small${poly || lane === 'pitch' ? '' : ' follows'}`}
                  title="Steps in this lane before it wraps"
                >
                  <button
                    type="button"
                    aria-label={`Shorter ${spec.label} lane`}
                    disabled={own <= 1}
                    onClick={() => actions.setArpParam(lenKey, Math.max(1, own - 1))}
                  >
                    −
                  </button>
                  <span class="mono">{own}</span>
                  <button
                    type="button"
                    aria-label={`Longer ${spec.label} lane`}
                    disabled={own >= spec.length}
                    onClick={() => actions.setArpParam(lenKey, Math.min(spec.length, own + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <StepLane
                id={`arp-${lane}`}
                spec={spec}
                value={arp[lane] as number[]}
                activeLength={len}
                playing={playing}
                text={lane === 'pitch' ? 'signed' : lane === 'repeats' ? 'times' : undefined}
                onChange={(v) => actions.setArpParam(lane, v)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
