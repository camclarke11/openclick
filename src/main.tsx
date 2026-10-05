import { render } from 'preact';
import { bus } from './core';
import { attachKeyboard, initMidi } from './input';
import { engine, patch } from './state/store';
import { App } from './ui/App';
import './ui/styles.css';

attachKeyboard(bus);
void initMidi(bus);

// Debug/test hook: lets e2e tests and the console inspect the engine and the notes played.
const events: { type: string; note?: number; velocity?: number; source?: string; padId?: number }[] = [];
const log = (type: string) => (m: object) => {
  events.push({ type, ...m });
  if (events.length > 100) events.shift();
};
bus.on('noteOn', log('noteOn'));
bus.on('noteOff', log('noteOff'));
bus.on('panic', log('panic'));
Object.assign(window, {
  __openclick: { engine, patch, bus, events, state: () => engine.context?.state ?? 'none' },
});

render(<App />, document.getElementById('app')!);
