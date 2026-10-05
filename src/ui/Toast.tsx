import { signal } from '@preact/signals';

const message = signal<string | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Show a short confirmation (saved, exported, imported) at the bottom of the workspace. */
export function notify(text: string): void {
  clearTimeout(timer);
  message.value = text;
  timer = setTimeout(() => (message.value = null), 2400);
}

export function Toast() {
  return (
    <div class="toast-region" role="status" aria-live="polite">
      {message.value && <div class="toast">{message.value}</div>}
    </div>
  );
}
