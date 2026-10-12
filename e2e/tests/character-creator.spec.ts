/**
 * Milestone 8's guided character creator, in a real browser. This spec starts
 * with the way out: the creator is a full-screen dialog, and the table menu
 * button floats fixed over the top-right corner at a higher z-index than any
 * panel, so a "Close" at the right end of the creator's header was once
 * unreachable by mouse. The two-browser creation flow is added here next.
 *
 * No compendium is imported (the config points the server at an empty one), so
 * the steps show their "nothing imported" notes; this spec is about the shell.
 */
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  openFromGearMenu,
  waitForConnected,
} from './helpers.js';

test('the creator can be left by mouse and by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createAndActivateCampaign(page, `Creator ${crypto.randomUUID()}`);
  await waitForConnected(page);
  await addSeat(page, 'Riley', true);
  await claimSeat(page, 'Riley');
  await openFromGearMenu(page, 'Characters');

  const dialog = page.getByRole('dialog', { name: 'Create a character' });
  const open = async () => {
    await page.getByRole('button', { name: 'Guided creation…' }).click();
    await expect(dialog).toBeVisible();
  };

  await open();
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  // Nothing may sit on top of it: ask the browser what is under its middle.
  const coveredBy = await close.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = el.ownerDocument.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === el || el.contains(top) ? '' : (top?.className ?? 'something');
  });
  expect(coveredBy, `Close is covered by .${coveredBy}`).toBe('');
  await close.click();
  await expect(dialog).toBeHidden();

  await open();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
