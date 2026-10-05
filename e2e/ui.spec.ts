import { expect, test } from '@playwright/test';
import { collectErrors, events, lastEvent, stubFonts } from './helpers';

test.beforeEach(async ({ page }) => {
  await stubFonts(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OpenClick' })).toBeVisible();
});

test('pads play chromatic notes and light up', async ({ page }) => {
  const errors = collectErrors(page);
  const pads = page.getByRole('group', { name: 'Pads' }).getByRole('button');
  await expect(pads).toHaveCount(16);

  const pad1 = page.getByRole('button', { name: 'Pad 1 C4' });
  await pad1.dispatchEvent('pointerdown', { pointerId: 1, clientY: 0 });
  await expect(pad1).toHaveClass(/lit/);
  expect(await lastEvent(page)).toMatchObject({ type: 'noteOn', note: 60, source: 'pad', padId: 0 });
  await pad1.dispatchEvent('pointerup', { pointerId: 1 });
  expect(await lastEvent(page)).toMatchObject({ type: 'noteOff', note: 60 });

  await page.getByRole('button', { name: 'Pad 16 D#5' }).dispatchEvent('pointerdown', { pointerId: 2 });
  expect(await lastEvent(page)).toMatchObject({ type: 'noteOn', note: 75, padId: 15 });
  expect(errors).toEqual([]);
});

test('computer keyboard plays notes, shifts octave and panics', async ({ page }) => {
  await page.keyboard.press('a');
  expect(await lastEvent(page)).toMatchObject({ type: 'noteOff', note: 60, source: 'keyboard' });
  const on = (await events(page)).filter((e) => e.type === 'noteOn');
  expect(on.at(-1)).toMatchObject({ note: 60, source: 'keyboard' });

  await page.keyboard.press('w');
  expect((await events(page)).at(-2)).toMatchObject({ type: 'noteOn', note: 61 });

  await page.keyboard.press('x');
  await expect(page.locator('.octave-value')).toHaveText('C5');
  await page.keyboard.press('k');
  expect((await events(page)).at(-2)).toMatchObject({ type: 'noteOn', note: 84 });

  await page.keyboard.press('z');
  await page.keyboard.press('Escape');
  expect(await lastEvent(page)).toMatchObject({ type: 'panic' });
});

test('keys typed into a text field do not play notes', async ({ page }) => {
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'scratch';
    document.body.append(input);
  });
  const before = (await events(page)).length;
  await page.locator('#scratch').pressSequentially('asdf');
  expect((await events(page)).length).toBe(before);
});

test('layers can be added, selected and removed', async ({ page }) => {
  const tabs = page.getByRole('tablist', { name: 'Layers' }).getByRole('tab');
  await expect(tabs).toHaveCount(1);
  await page.getByRole('button', { name: 'Add Beep layer' }).click();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Beep · Layer 2' })).toBeVisible();

  await page
    .getByRole('radiogroup', { name: 'Layer 2 source' })
    .getByRole('radio', { name: 'Click' })
    .click();
  await expect(tabs.nth(1)).toContainText('Click');
  await expect(page.getByRole('heading', { name: 'Click · Layer 2' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Click layer' }).click();
  await page.getByRole('button', { name: 'Add Beep layer' }).click();
  await expect(tabs).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Add Beep layer' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove layer 4' }).click();
  await expect(tabs).toHaveCount(3);
  await tabs.first().click();
  await page.getByRole('button', { name: 'Remove layer 1' }).click();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toContainText('Click');
});

test('module panel switches parameter groups', async ({ page }) => {
  await expect(page.getByRole('slider', { name: 'Cutoff' })).toBeVisible();
  await page.getByRole('group', { name: 'Parameter groups' }).getByRole('button', { name: 'FM' }).click();
  await expect(page.getByRole('slider', { name: 'Cutoff' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'FM decay' })).toBeVisible();
});

test('space plays middle C, even with a button focused', async ({ page }) => {
  await page.getByRole('button', { name: 'Mutate' }).focus();
  const before = await page.evaluate(() =>
    JSON.stringify(
      (window as unknown as { __openclick: { patch: { value: unknown } } }).__openclick.patch.value,
    ),
  );
  await page.keyboard.press('Space');
  const log = await events(page);
  expect(log.at(-2)).toMatchObject({ type: 'noteOn', note: 60 });
  expect(log.at(-1)).toMatchObject({ type: 'noteOff', note: 60 });
  const after = await page.evaluate(() =>
    JSON.stringify(
      (window as unknown as { __openclick: { patch: { value: unknown } } }).__openclick.patch.value,
    ),
  );
  expect(after).toBe(before);
});

test('effects tab adds, bypasses and removes effects', async ({ page }) => {
  const errors = collectErrors(page);
  await page.getByRole('tab', { name: /Effects/ }).click();
  await page.getByRole('button', { name: 'Add Reverb' }).click();
  await page.getByRole('button', { name: 'Add Delay' }).click();
  const cards = page.getByRole('group', { name: 'Effects' }).getByRole('listitem', { name: /slot/ });
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Move Delay earlier' }).click();
  await expect(cards.first()).toHaveAccessibleName('Delay (slot 1)');
  await page.getByRole('switch', { name: 'Reverb enabled' }).click();
  await expect(page.getByRole('switch', { name: 'Reverb enabled' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Remove Delay' }).click();
  await expect(cards).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('export options open and remember the format', async ({ page }) => {
  await page.getByRole('button', { name: 'Export options' }).click();
  const format = page.getByRole('radiogroup', { name: 'Format' });
  await format.getByRole('radio', { name: '24-bit' }).click();
  await expect(format.getByRole('radio', { name: '24-bit' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'More variations' }).click();
  await expect(page.getByRole('button', { name: 'Export 2 WAVs' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(format).toHaveCount(0);
});

test('preset browser filters by group and loads a preset', async ({ page }) => {
  await page.getByRole('radiogroup', { name: 'Preset group' }).getByRole('radio', { name: 'Game' }).click();
  const list = page.getByRole('list', { name: 'Presets' });
  const metas = await list.locator('.preset-item-meta').allTextContents();
  expect(metas.length).toBeGreaterThan(0);
  expect(metas.every((m) => m.startsWith('Game/'))).toBe(true);
  const first = list.locator('.preset-item').first();
  const name = await first.locator('.preset-item-name').textContent();
  await first.click();
  await expect(page.locator('.hero h2')).toHaveText(name!);
});

test('knobs respond to keyboard and double-click reset', async ({ page }) => {
  const transpose = page.getByRole('slider', { name: 'Transpose' });
  await expect(transpose).toHaveAttribute('aria-valuenow', '0');
  await transpose.focus();
  await page.keyboard.press('ArrowUp');
  await expect(transpose).toHaveAttribute('aria-valuenow', '1');
  await page.keyboard.press('End');
  await expect(transpose).toHaveAttribute('aria-valuenow', '24');
  await transpose.dblclick();
  await expect(transpose).toHaveAttribute('aria-valuenow', '0');
});

test('randomise all changes the patch without errors', async ({ page }) => {
  const errors = collectErrors(page);
  const read = () =>
    page.evaluate(() =>
      JSON.stringify(
        (window as unknown as { __openclick: { patch: { value: unknown } } }).__openclick.patch.value,
      ),
    );
  const before = await read();
  await page.getByRole('button', { name: 'Randomise all' }).click();
  expect(await read()).not.toBe(before);
  expect(errors).toEqual([]);
});

test('shows the MIDI control without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await expect(
    page.getByRole('button', { name: /MIDI/ }).or(page.getByText(/MIDI not|MIDI isn't/)),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('fits a phone screen without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('step lanes edit arp values from the keyboard', async ({ page }) => {
  const read = () =>
    page.evaluate(
      () =>
        (window as unknown as { __openclick: { patch: { value: { arp: Record<string, unknown> } } } })
          .__openclick.patch.value.arp,
    );
  const lane = page.getByRole('group', { name: /^Pitch:/ });
  const before = (await read()).pitch as number[];
  await lane.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  const after = (await read()).pitch as number[];
  expect(after[1]).toBeGreaterThan(before[1]!);
  expect(after[0]).toBe(before[0]);
});

test('pads release the note they played, even across an octave change', async ({ page }) => {
  const pad1 = page.getByRole('button', { name: 'Pad 1 C4' });
  await pad1.dispatchEvent('pointerdown', { pointerId: 7 });
  await page.getByRole('button', { name: 'Octave up' }).click();
  await page.getByRole('button', { name: 'Pad 1 C5' }).dispatchEvent('pointerup', { pointerId: 7 });
  expect(await lastEvent(page)).toMatchObject({ type: 'noteOff', note: 60, source: 'pad' });
});

test('pads play and release from Enter and Space', async ({ page }) => {
  const pad = page.getByRole('button', { name: 'Pad 2 C#4' });
  await pad.focus();
  await page.keyboard.press('Enter');
  const log = await events(page);
  expect(log.at(-2)).toMatchObject({ type: 'noteOn', note: 61, padId: 1 });
  expect(log.at(-1)).toMatchObject({ type: 'noteOff', note: 61 });
  await page.keyboard.down(' ');
  expect(await lastEvent(page)).toMatchObject({ type: 'noteOn', note: 61 });
  await page.getByRole('button', { name: 'Pad 3 D4' }).focus();
  expect(await lastEvent(page)).toMatchObject({ type: 'noteOff', note: 61 });
  await page.keyboard.up(' ');
});
