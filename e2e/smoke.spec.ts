import { expect, test } from '@playwright/test';
import { audioState, collectErrors, stubFonts } from './helpers';

test('loads and plays a sound from a pad without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await stubFonts(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OpenClick' })).toBeVisible();
  await page.getByRole('button', { name: /^Pad 1 / }).dispatchEvent('pointerdown');
  await expect.poll(() => audioState(page)).toBe('running');
  expect(errors).toEqual([]);
});
