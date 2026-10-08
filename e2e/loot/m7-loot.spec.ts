/**
 * Milestone 7's primary flow: the GM hands out loot, a player uses and gives
 * things away, and the party stash is shared out -- two independent
 * `BrowserContext`s standing in for two machines, driven through the real
 * client, server and socket. The compendium is a tiny invented fixture
 * (`loot/fixtures/`, see `playwright.loot.config.ts`), never Paizo content.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  openFromGearMenu,
  waitForConnected,
} from '../tests/helpers.js';

const purse = (page: Page, scope: string, denomination: string) =>
  page.locator(`${scope} .purse .coin`).filter({ hasText: denomination });

test('the GM hands out loot, a player uses and gives, and the stash is split', async ({
  browser,
}) => {
  const campaignName = `E2E Loot ${crypto.randomUUID()}`;
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();

  try {
    // --- A table: a GM and one player with a character in the party. ---
    await createAndActivateCampaign(gm, campaignName);
    await waitForConnected(gm);
    await addSeat(gm, 'Game Master', true);
    await addSeat(gm, 'Valeros', false);
    await claimSeat(gm, 'Game Master');
    await player.goto('/');
    await waitForConnected(player);
    await claimSeat(player, 'Valeros');

    await openFromGearMenu(player, 'Characters');
    await player.getByLabel('New character name').fill('Valeria');
    await player.getByRole('button', { name: 'Create character' }).click();
    await expect(
      player.getByRole('heading', { name: 'Valeria', level: 3 }),
    ).toBeVisible();

    await openFromGearMenu(gm, 'Characters');
    await expect(gm.getByRole('button', { name: 'Valeria (character)' })).toBeVisible();
    await openFromGearMenu(gm, 'Manage party');
    await gm.getByLabel('Add to party').selectOption({ label: 'Valeria (character)' });
    await gm.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
      gm.locator('.party-member').filter({ hasText: 'Valeria' }),
    ).toBeVisible();

    // --- The GM hands Valeria 3 gp, 2 ropes and a potion. Her screen updates live. ---
    const loot = gm.locator('.loot');
    await expect(loot).toBeVisible();
    await expect(loot.getByLabel('Give loot to')).toHaveValue(/.+/);
    await loot.getByLabel('gp to hand out').fill('3');
    await loot.getByRole('button', { name: 'Give coins' }).click();
    await expect(loot.getByRole('status')).toContainText('Gave 3 gp to Valeria');

    await loot.getByLabel('How many to hand out').fill('2');
    await loot.getByRole('button', { name: 'Give Invented Rope' }).click();
    await expect(loot.getByRole('status')).toContainText(
      'Gave 2 × Invented Rope to Valeria',
    );
    await loot.getByLabel('How many to hand out').fill('1');
    await loot.getByRole('button', { name: 'Give Invented Healing Potion' }).click();
    await expect(loot.getByRole('status')).toContainText('Invented Healing Potion');

    await player.getByRole('tab', { name: 'Inventory' }).click();
    const mine = player.locator('section.inventory');
    await expect(purse(player, '.coins', 'gp')).toContainText('3');
    await expect(mine.getByLabel('Quantity of Invented Rope')).toHaveValue('2');
    await expect(
      mine.locator('.item').filter({ hasText: 'Invented Healing Potion' }),
    ).toBeVisible();
    // Price (10 cp is shown as 1 sp) and Bulk show on the items the GM handed over.
    await expect(
      mine.locator('.item').filter({ hasText: 'Invented Rope' }),
    ).toContainText('1 sp');

    // --- The player uses the potion: it posts a card for both, and is spent. ---
    await player.getByRole('button', { name: 'Use Invented Healing Potion' }).click();
    for (const page of [player, gm]) {
      await expect(page.getByText('Valeria used Invented Healing Potion')).toBeVisible();
    }
    await expect(
      mine.locator('.item').filter({ hasText: 'Invented Healing Potion' }),
    ).toHaveCount(0);

    // --- The player puts a rope in the party stash. ---
    await player.getByRole('button', { name: 'Give Invented Rope' }).click();
    await player.getByLabel('Give to').selectOption({ label: 'Party stash' });
    await player.getByLabel('How many to give').fill('1');
    await player.getByRole('button', { name: 'Give', exact: true }).click();
    await expect(mine.getByLabel('Quantity of Invented Rope')).toHaveValue('1');

    // --- The GM sees it in the stash, adds coins to it, and splits them. ---
    await gm.locator('.party-member').filter({ hasText: 'Valeria' }).click();
    await gm.getByRole('tab', { name: 'Inventory' }).click();
    const stash = gm.locator('.stash');
    await expect(
      stash.locator('.item').filter({ hasText: 'Invented Rope' }),
    ).toBeVisible();

    await loot.getByLabel('Give loot to').selectOption({ label: 'Party stash' });
    await loot.getByLabel('gp to hand out').fill('4');
    await loot.getByRole('button', { name: 'Give coins' }).click();
    await expect(purse(gm, '.stash', 'gp')).toContainText('4');

    await stash.getByRole('button', { name: 'Split evenly' }).click();
    // One member, so she gets all 4 gp: 3 + 4 = 7 (kept under 10 gp, which a purse
    // makes into 1 pp). The stash is empty again.
    await expect(purse(player, '.coins', 'gp')).toContainText('7');
    await expect(purse(gm, '.stash', 'gp')).toContainText('0');
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
