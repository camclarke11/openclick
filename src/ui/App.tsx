import { useEffect } from 'preact/hooks';
import { bus } from '../core';
import { isTypingTarget } from '../input';
import { PresetSidebar } from '../presets';
import { Dock } from './Dock';
import { Header } from './Header';
import { Hero } from './Hero';
import { LayerCards } from './Layers';
import { ModulePanel } from './ModulePanel';
import { startPlayback } from './playback';
import { PlayPanel } from './PlayPanel';
import { notify, Toast } from './Toast';

const SPACE_NOTE = 60;

/**
 * Space plays middle C from anywhere except text fields and pads (which use Space to play
 * themselves). It takes over Space from focused buttons too, so tweaking a control and then
 * auditioning never re-triggers the control.
 */
function attachSpaceToPlay(): () => void {
  let down = false;
  const ours = (e: KeyboardEvent) =>
    e.code === 'Space' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !isTypingTarget(e.target) &&
    !(e.target instanceof Element && e.target.closest('.pads'));
  const onDown = (e: KeyboardEvent) => {
    if (!ours(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || down) return;
    down = true;
    bus.emit('noteOn', { note: SPACE_NOTE, velocity: 0.9, source: 'keyboard' });
  };
  const onUp = (e: KeyboardEvent) => {
    if (!ours(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!down) return;
    down = false;
    bus.emit('noteOff', { note: SPACE_NOTE, source: 'keyboard' });
  };
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  return () => {
    window.removeEventListener('keydown', onDown, true);
    window.removeEventListener('keyup', onUp, true);
  };
}

export function App() {
  useEffect(() => {
    const stopPlayback = startPlayback();
    const detachSpace = attachSpaceToPlay();
    return () => {
      stopPlayback();
      detachSpace();
    };
  }, []);

  return (
    <div class="studio">
      <Header />
      <PresetSidebar notify={notify} />
      <main class="main">
        <Hero />
        <LayerCards />
        <ModulePanel />
      </main>
      <PlayPanel />
      <Dock />
      <Toast />
    </div>
  );
}
