import type { Page } from '@playwright/test';

export interface LoggedEvent {
  type: string;
  note?: number;
  velocity?: number;
  source?: string;
  padId?: number;
}

interface Hook {
  state(): string;
  events: LoggedEvent[];
}

export const audioState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __openclick?: Hook }).__openclick?.state());

export const events = (page: Page) =>
  page.evaluate(() => [...((window as unknown as { __openclick?: Hook }).__openclick?.events ?? [])]);

export const lastEvent = async (page: Page) => (await events(page)).at(-1);

/** Fail the test on any page error or console error. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}
