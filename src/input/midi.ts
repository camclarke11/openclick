import { signal } from '@preact/signals';
import type { BusEvents, EventBus } from '../core';

/** Web MIDI input. Omni (all channels); degrades to 'unsupported' where Web MIDI is missing. */
export type MidiMessage =
  { type: 'noteOn'; note: number; velocity: number } | { type: 'noteOff'; note: number } | { type: 'panic' };

/** Decode a raw MIDI message. Pure, for tests. */
export function parseMidiMessage(data: ArrayLike<number>): MidiMessage | null {
  if (data.length < 3) return null;
  const status = data[0]! & 0xf0;
  const d1 = data[1]! & 0x7f;
  const d2 = data[2]! & 0x7f;
  if (status === 0x90 && d2 > 0) return { type: 'noteOn', note: d1, velocity: d2 / 127 };
  if (status === 0x80 || status === 0x90) return { type: 'noteOff', note: d1 };
  // CC 120 all sound off, CC 123 all notes off.
  if (status === 0xb0 && (d1 === 120 || d1 === 123)) return { type: 'panic' };
  return null;
}

export type MidiStatus = 'unsupported' | 'off' | 'pending' | 'ready' | 'denied';

export interface MidiDevice {
  id: string;
  name: string;
}

export const ALL_DEVICES = 'all';

export const midiStatus = signal<MidiStatus>('off');
export const midiDevices = signal<MidiDevice[]>([]);
/** Device id to listen to, or ALL_DEVICES. */
export const midiDevice = signal<string>(ALL_DEVICES);

let access: MIDIAccess | null = null;
let midiBus: EventBus<BusEvents> | null = null;

export const midiSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

function onMessage(this: MIDIInput, e: MIDIMessageEvent) {
  if (!midiBus || !e.data) return;
  if (midiDevice.value !== ALL_DEVICES && midiDevice.value !== this.id) return;
  const msg = parseMidiMessage(e.data);
  if (!msg) return;
  if (msg.type === 'noteOn')
    midiBus.emit('noteOn', { note: msg.note, velocity: msg.velocity, source: 'midi' });
  else if (msg.type === 'noteOff') midiBus.emit('noteOff', { note: msg.note, source: 'midi' });
  else midiBus.emit('panic', {});
}

function refreshDevices() {
  if (!access) return;
  const devices: MidiDevice[] = [];
  access.inputs.forEach((input) => {
    if (input.state === 'disconnected') return;
    input.onmidimessage = onMessage;
    devices.push({ id: input.id, name: input.name || `Input ${devices.length + 1}` });
  });
  midiDevices.value = devices;
  if (midiDevice.value !== ALL_DEVICES && !devices.some((d) => d.id === midiDevice.value)) {
    midiDevice.value = ALL_DEVICES;
  }
}

/** Ask for MIDI access (may show a browser permission prompt) and start listening. */
export async function enableMidi(bus: EventBus<BusEvents>): Promise<MidiStatus> {
  midiBus = bus;
  if (!midiSupported()) return (midiStatus.value = 'unsupported');
  if (access) return midiStatus.value;
  midiStatus.value = 'pending';
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = refreshDevices;
    refreshDevices();
    return (midiStatus.value = 'ready');
  } catch {
    return (midiStatus.value = 'denied');
  }
}

/**
 * Set up MIDI without prompting: reports 'unsupported' where Web MIDI is missing, and connects
 * straight away if the user already granted permission on an earlier visit.
 */
export async function initMidi(bus: EventBus<BusEvents>): Promise<void> {
  midiBus = bus;
  if (!midiSupported()) {
    midiStatus.value = 'unsupported';
    return;
  }
  try {
    const perm = await navigator.permissions?.query({ name: 'midi' as PermissionName });
    if (perm?.state === 'granted') await enableMidi(bus);
  } catch {
    // Permissions API doesn't know 'midi' in this browser; wait for the user to enable it.
  }
}
