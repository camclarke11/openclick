import { expect, test } from '@playwright/test';

test('loads and plays a sound from the pad without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OpenClick' })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).dispatchEvent('pointerdown');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __openclick?: { state(): string } }).__openclick?.state()),
    )
    .toBe('running');
  expect(errors).toEqual([]);
});
