import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { collectErrors, stubFonts } from './helpers';

test('downloads the Roblox pack as one zip of WAVs', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await stubFonts(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Download pack' }).click();
  const options = page.getByRole('group', { name: 'Download pack' });
  await options.getByRole('radio', { name: /^Roblox/ }).click();
  const started = Date.now();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 110_000 }),
    options.getByRole('button', { name: /^Download \d+ WAVs$/ }).click(),
  ]);
  console.log(`Roblox pack rendered in ${Date.now() - started} ms`);
  expect(download.suggestedFilename()).toBe('sounds-roblox-pack.zip');
  const zip = readFileSync(await download.path());
  // Stored zip: count local file headers that name a .wav.
  const names = zip.toString('latin1').match(/sounds-roblox-pack\/[^\0]*?\.wav/g) ?? [];
  expect(new Set(names).size).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});
