import { useEffect, useState } from 'preact/hooks';
import { bus } from '../core';
import {
  ALL_DEVICES,
  enableMidi,
  KEY_SEMITONES,
  MAX_OCTAVE,
  midiDevice,
  midiDevices,
  midiStatus,
  MIN_OCTAVE,
  noteName,
  octave,
  octaveBase,
  PAD_COUNT,
  shiftOctave,
} from '../input';
import { Pads } from './Pads';

const WHITE = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];
/** Black keys and the white key they sit after (0-based). */
const BLACK: [string, number][] = [
  ['KeyW', 0],
  ['KeyE', 1],
  ['KeyT', 3],
  ['KeyY', 4],
  ['KeyU', 5],
];
const keyLetter = (code: string) => code.replace('Key', '');

/** On-screen picture of the computer keyboard mapping; keys light up and can be clicked. */
function KeyboardMap() {
  const base = octaveBase(octave.value);
  const [lit, setLit] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    const off = bus.on('noteOn', (m) => {
      const n = Math.round(m.note);
      setLit((s) => new Set(s).add(n));
      setTimeout(
        () =>
          setLit((s) => {
            const next = new Set(s);
            next.delete(n);
            return next;
          }),
        150,
      );
    });
    return off;
  }, []);
  const hit = (code: string) => {
    const note = base + KEY_SEMITONES[code]!;
    bus.emit('noteOn', { note, velocity: 0.8, source: 'ui' });
    bus.emit('noteOff', { note, source: 'ui' });
  };
  const key = (code: string, cls: string, style?: Record<string, string>) => {
    const note = base + KEY_SEMITONES[code]!;
    return (
      <button
        key={code}
        type="button"
        tabIndex={-1}
        class={`${cls}${lit.has(note) ? ' lit' : ''}`}
        style={style}
        aria-label={`${keyLetter(code)} plays ${noteName(note)}`}
        onPointerDown={(e) => {
          e.preventDefault();
          hit(code);
        }}
      >
        {keyLetter(code)}
      </button>
    );
  };
  return (
    <div class="keymap" aria-label="Computer keyboard" role="group">
      {WHITE.map((c) => key(c, 'white-key'))}
      {BLACK.map(([c, after]) =>
        key(c, 'black-key', { left: `${((after + 1) / WHITE.length) * 100 - 4.5}%` }),
      )}
    </div>
  );
}

function Midi() {
  const status = midiStatus.value;
  if (status === 'ready') {
    return (
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
    );
  }
  if (status === 'unsupported') {
    return (
      <span class="muted small-text">
        Web MIDI isn't available in this browser. Pads and keyboard still work.
      </span>
    );
  }
  return (
    <button
      type="button"
      class="btn"
      disabled={status === 'pending'}
      onClick={() => void enableMidi(bus)}
      title={
        status === 'denied' ? 'MIDI access was blocked; allow it in site settings' : 'Use a MIDI keyboard'
      }
    >
      {status === 'denied' ? 'MIDI blocked' : status === 'pending' ? 'Connecting…' : 'Connect MIDI device'}
    </button>
  );
}

/** Right column: pads with octave control, the computer keyboard map, MIDI input and shortcuts. */
export function PlayPanel() {
  const base = octaveBase(octave.value);
  return (
    <aside class="play" aria-label="Play">
      <div class="play-head">
        <span class="eyebrow">Pads</span>
        <div class="octave" role="group" aria-label="Octave">
          <button
            type="button"
            class="btn key-btn mono"
            aria-label="Octave down"
            title="Octave down (Z)"
            disabled={octave.value <= MIN_OCTAVE}
            onClick={() => shiftOctave(-1)}
          >
            Z
          </button>
          <span class="octave-range mono" aria-live="polite" title="Notes on the pads">
            <span class="octave-value">{noteName(base)}</span>–{noteName(base + PAD_COUNT - 1)}
          </span>
          <button
            type="button"
            class="btn key-btn mono"
            aria-label="Octave up"
            title="Octave up (X)"
            disabled={octave.value >= MAX_OCTAVE}
            onClick={() => shiftOctave(1)}
          >
            X
          </button>
        </div>
      </div>
      <Pads />
      <div class="play-section">
        <span class="eyebrow">Computer keyboard</span>
        <KeyboardMap />
      </div>
      <div class="play-section">
        <span class="eyebrow">MIDI input</span>
        <Midi />
      </div>
      <dl class="shortcuts">
        <dt class="mono">Space</dt>
        <dd>Play middle C</dd>
        <dt class="mono">Esc</dt>
        <dd>Stop all sound</dd>
        <dt class="mono">Shift</dt>
        <dd>Fine adjust while dragging</dd>
        <dt class="mono">Dbl-click</dt>
        <dd>Reset a control</dd>
      </dl>
    </aside>
  );
}
