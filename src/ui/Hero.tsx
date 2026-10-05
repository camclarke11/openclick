import { useRef } from 'preact/hooks';
import { bus } from '../core';
import { currentPreset } from '../state/store';
import { progress, waveform } from './playback';

const PLAY_NOTE = 60;

function formatDuration(s: number): string {
  return s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`;
}

function Wave() {
  const { bars, duration } = waveform.value;
  const prog = progress.value;
  return (
    <div class="wave">
      <div class="wave-bars" role="img" aria-label={`Waveform, ${formatDuration(duration)}`}>
        {bars.map((b, i) => (
          <div
            key={i}
            class={`wave-bar${prog !== null && i / bars.length <= prog ? ' played' : ''}`}
            style={{ height: `${(6 + b * 94).toFixed(1)}%` }}
          />
        ))}
      </div>
      <div class="wave-axis mono">
        <span>0 ms</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}

/** Current sound: name, category and tags, its waveform, and the big Play button. */
export function Hero() {
  const cur = currentPreset.value;
  const held = useRef(false);
  const release = () => {
    if (!held.current) return;
    held.current = false;
    bus.emit('noteOff', { note: PLAY_NOTE, source: 'ui' });
  };
  return (
    <div class="hero">
      <div class="hero-info">
        <div class="hero-title">
          <h2>{cur?.name ?? 'Init'}</h2>
          <span class="muted">{cur?.category ?? 'Default patch'}</span>
          {cur?.tags.map((t) => (
            <span key={t} class="hero-tag">
              #{t}
            </span>
          ))}
        </div>
        <Wave />
      </div>
      <button
        type="button"
        class="play-btn"
        aria-label="Play"
        title="Play middle C (Space)"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          held.current = true;
          bus.emit('noteOn', { note: PLAY_NOTE, velocity: 0.9, source: 'ui' });
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.repeat) return;
          e.preventDefault();
          bus.emit('noteOn', { note: PLAY_NOTE, velocity: 0.9, source: 'ui' });
          bus.emit('noteOff', { note: PLAY_NOTE, source: 'ui' });
        }}
      >
        <span class="play-tri" aria-hidden="true" />
        <span>Play</span>
        <span class="play-key mono">SPACE</span>
      </button>
    </div>
  );
}
