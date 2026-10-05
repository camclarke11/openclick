import { render } from 'preact';
import { engine, patch } from './state/store';
import { App } from './ui/App';
import './ui/styles.css';

// Debug/test hook: lets e2e tests and the console inspect the engine.
Object.assign(window, {
  __openclick: { engine, patch, state: () => engine.context?.state ?? 'none' },
});

render(<App />, document.getElementById('app')!);
