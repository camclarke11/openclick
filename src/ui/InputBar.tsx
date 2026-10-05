import { bus } from '../core';
import {
  ALL_DEVICES,
  enableMidi,
  MAX_OCTAVE,
  midiDevice,
  midiDevices,
  midiStatus,
  MIN_OCTAVE,
  noteName,
  octave,
  octaveBase,
  shiftOctave,
} from '../input';

/** Octave, MIDI device picker and panic, under the pads. */
export function InputBar() {
  const status = midiStatus.value;
  return (
    <div class="input-bar">
      <div class="octave" role="group" aria-label="Octave">
        <button
          type="button"
          class="icon-btn"
          aria-label="Octave down"
          title="Octave down (Z)"
          disabled={octave.value <= MIN_OCTAVE}
          onClick={() => shiftOctave(-1)}
        >
          −
        </button>
        <span class="octave-value" aria-live="polite" title="Keys A–K play from this note">
          {noteName(octaveBase(octave.value))}
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="Octave up"
          title="Octave up (X)"
          disabled={octave.value >= MAX_OCTAVE}
          onClick={() => shiftOctave(1)}
        >
          +
        </button>
      </div>

      <div class="midi">
        {status === 'ready' ? (
          <select
            aria-label="MIDI input"
            value={midiDevice.value}
            onChange={(e) => (midiDevice.value = e.currentTarget.value)}
          >
            <option value={ALL_DEVICES}>
              {midiDevices.value.length ? 'All MIDI inputs' : 'No MIDI devices found'}
            </option>
            {midiDevices.value.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : status === 'unsupported' ? (
          <span class="hint" title="Web MIDI works in Chrome and Edge">
            MIDI not supported in this browser
          </span>
        ) : (
          <button
            type="button"
            class="btn"
            disabled={status === 'pending'}
            onClick={() => void enableMidi(bus)}
            title={
              status === 'denied'
                ? 'MIDI access was blocked; allow it in site settings'
                : 'Use a MIDI keyboard'
            }
          >
            {status === 'denied' ? 'MIDI blocked' : status === 'pending' ? 'Connecting…' : 'Enable MIDI'}
          </button>
        )}
      </div>

      <button
        type="button"
        class="btn panic"
        onClick={() => bus.emit('panic', {})}
        title="Stop all sound (Esc)"
      >
        Stop
      </button>
    </div>
  );
}
