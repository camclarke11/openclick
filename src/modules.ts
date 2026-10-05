import { createRegistry } from './core';
import { beepSource } from './engines/beep';
import { clickSource } from './engines/click';
import { effects } from './fx';
import { arp } from './arp';

/**
 * The one place modules are wired together. Each workstream exports from its own directory's
 * index.ts, so this file should not need to change.
 */
export const registry = createRegistry({
  sources: [beepSource, clickSource],
  effects,
  arp,
});
