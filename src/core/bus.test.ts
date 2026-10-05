import { describe, expect, it, vi } from 'vitest';
import { EventBus, type BusEvents } from './bus';

describe('EventBus', () => {
  it('delivers events and unsubscribes', () => {
    const b = new EventBus<BusEvents>();
    const fn = vi.fn();
    const off = b.on('noteOn', fn);
    b.emit('noteOn', { note: 60, velocity: 1, source: 'test' });
    off();
    b.emit('noteOn', { note: 61, velocity: 1, source: 'test' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ note: 60, velocity: 1, source: 'test' });
  });
});
