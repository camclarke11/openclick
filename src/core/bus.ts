/**
 * Note event bus. Every input (on-screen pads, computer keyboard, MIDI, arpeggiator preview,
 * tests) publishes here; the engine subscribes. Inputs never call the engine directly.
 */
export type InputSource = 'pad' | 'keyboard' | 'midi' | 'ui' | 'test';

export interface NoteOnMessage {
  /** MIDI note number, 60 = middle C. */
  note: number;
  /** 0..1 */
  velocity: number;
  source: InputSource;
  /** Optional id of the pad that fired, for pad highlighting. */
  padId?: number;
}

export interface NoteOffMessage {
  note: number;
  source: InputSource;
}

export interface BusEvents {
  noteOn: NoteOnMessage;
  noteOff: NoteOffMessage;
  /** Stop all sound immediately (panic button, Escape key). */
  panic: Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = BusEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const h of this.handlers.get(type) ?? []) (h as Handler<E[K]>)(payload);
  }
}

/** The app-wide bus. */
export const bus = new EventBus<BusEvents>();
