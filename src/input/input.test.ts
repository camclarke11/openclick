import { describe, expect, it } from 'vitest';
import { EventBus, type BusEvents } from '../core';
import { attachKeyboard, keyAction, octave, octaveBase } from './keyboard';
import { parseMidiMessage } from './midi';
import { noteName } from './notes';
import { padForNote, padIdAt, padNote, velocityFromY } from './pads';

describe('keyboard', () => {
  it('maps the home row to white keys and the top row to black keys', () => {
    expect(keyAction({ code: 'KeyA' })).toEqual({ type: 'note', semitone: 0 });
    expect(keyAction({ code: 'KeyW' })).toEqual({ type: 'note', semitone: 1 });
    expect(keyAction({ code: 'KeyJ' })).toEqual({ type: 'note', semitone: 11 });
    expect(keyAction({ code: 'KeyK' })).toEqual({ type: 'note', semitone: 12 });
    expect(keyAction({ code: 'KeyQ' })).toBeNull();
  });

  it('handles octave, panic, repeats and shortcuts', () => {
    expect(keyAction({ code: 'KeyZ' })).toEqual({ type: 'octave', delta: -1 });
    expect(keyAction({ code: 'KeyX' })).toEqual({ type: 'octave', delta: 1 });
    expect(keyAction({ code: 'Escape' })).toEqual({ type: 'panic' });
    expect(keyAction({ code: 'KeyA', repeat: true })).toBeNull();
    expect(keyAction({ code: 'KeyA', metaKey: true })).toBeNull();
    expect(keyAction({ code: 'KeyS', ctrlKey: true })).toBeNull();
  });

  it('emits notes on the bus and releases them on key up', () => {
    const target = new EventTarget() as unknown as Window;
    const bus = new EventBus<BusEvents>();
    const log: string[] = [];
    bus.on('noteOn', (m) => log.push(`on ${m.note} ${m.source}`));
    bus.on('noteOff', (m) => log.push(`off ${m.note}`));
    bus.on('panic', () => log.push('panic'));
    octave.value = 4;
    const detach = attachKeyboard(bus, target);
    const key = (type: string, code: string) =>
      target.dispatchEvent(Object.assign(new Event(type), { code, preventDefault() {} }));
    key('keydown', 'KeyA');
    key('keydown', 'KeyA'); // held: no retrigger
    key('keydown', 'KeyX'); // octave up while A is held
    key('keyup', 'KeyA'); // releases the note it played, not the new octave's
    key('keydown', 'KeyA');
    key('keydown', 'Escape');
    detach();
    expect(log).toEqual(['on 60 keyboard', 'off 60', 'on 72 keyboard', 'off 72', 'panic']);
    expect(octave.value).toBe(5);
    octave.value = 4;
  });

  it('puts the A key on C of the octave', () => {
    expect(octaveBase(4)).toBe(60);
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(59)).toBe('B3');
  });
});

describe('midi', () => {
  it('decodes note on/off on any channel', () => {
    expect(parseMidiMessage([0x90, 60, 127])).toEqual({ type: 'noteOn', note: 60, velocity: 1 });
    expect(parseMidiMessage([0x95, 64, 0])).toEqual({ type: 'noteOff', note: 64 });
    expect(parseMidiMessage([0x83, 64, 40])).toEqual({ type: 'noteOff', note: 64 });
  });

  it('treats all-notes-off and all-sound-off as panic and ignores the rest', () => {
    expect(parseMidiMessage([0xb0, 123, 0])).toEqual({ type: 'panic' });
    expect(parseMidiMessage([0xbf, 120, 0])).toEqual({ type: 'panic' });
    expect(parseMidiMessage([0xb0, 1, 64])).toBeNull();
    expect(parseMidiMessage([0xf8])).toBeNull();
  });
});

describe('pads', () => {
  it('numbers pads from the bottom-left like a pad controller', () => {
    expect(padIdAt(12)).toBe(0); // bottom-left in DOM order
    expect(padIdAt(15)).toBe(3);
    expect(padIdAt(0)).toBe(12); // top-left
    expect(padIdAt(3)).toBe(15);
    expect(padNote(5, 60)).toBe(65);
  });

  it('finds the pad for a played note', () => {
    expect(padForNote(60, 60)).toBe(0);
    expect(padForNote(75, 60)).toBe(15);
    expect(padForNote(76, 60)).toBeUndefined();
    expect(padForNote(59, 60)).toBeUndefined();
  });

  it('gives full velocity at the top and soft at the bottom', () => {
    expect(velocityFromY(100, 100, 50)).toBe(1);
    expect(velocityFromY(150, 100, 50)).toBeCloseTo(0.2);
    expect(velocityFromY(125, 100, 50)).toBeCloseTo(0.6);
    expect(velocityFromY(999, 100, 50)).toBeCloseTo(0.2);
    expect(velocityFromY(0, 0, 0)).toBe(1);
  });
});
