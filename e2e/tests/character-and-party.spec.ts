/**
 * Milestone 3's primary flow: a player makes and hand-builds a character, the
 * GM puts it in the party, and the two see each other's changes live. Two
 * independent `BrowserContext`s stand in for two machines (see
 * `lobby-and-chat.spec.ts`), driven through the real client, server, and
 * socket -- no fixtures, no stubs, and no compendium (the config points the
 * server at an empty one, so nothing here depends on what a contributor has
 * imported).
 *
 * Not covered here: a hidden (`none`) actor never reaching a player. There is
 * no UI to hide an actor yet (`actor.setPermissions` is unbuilt), so that
 * guarantee is held by the server's socket tests (`realtime.test.ts`,
 * `visibility.test.ts`) rather than this spec.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  waitForConnected,
} from './helpers.js';

function skillTotal(page: Page, skill: string): Locator {
  return page
    .locator('section[aria-labelledby="skills-heading"] tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: skill, exact: true }) })
    .locator('.total');
}

/** Sets a number field by its label and commits it (a field saves on change, not per keystroke). */
async function setNumber(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Tab');
}

test('a player builds a character, the GM adds it to the party, and they play with it live', async ({
  browser,
}) => {
  const campaignName = `E2E Party ${crypto.randomUUID()}`;
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();

  try {
    // --- A table: a GM and one player, both seated. ---
    await createAndActivateCampaign(gm, campaignName);
    await waitForConnected(gm);
    await addSeat(gm, 'Game Master', true);
    await addSeat(gm, 'Valeros', false);
    await claimSeat(gm, 'Game Master');

    await player.goto('/');
    await waitForConnected(player);
    await claimSeat(player, 'Valeros');

    // --- Nothing is imported (the config points at an empty compendium), so the
    // GM is offered the import button, in plain words, and the player is not. ---
    await expect(
      gm.getByRole('heading', { name: 'This table has no game content yet' }),
    ).toBeVisible();
    await expect(gm.getByRole('button', { name: 'Import game content' })).toBeVisible();
    await expect(player.getByRole('button', { name: 'Import game content' })).toHaveCount(
      0,
    );

    // --- The player opens the character drawer, makes a character, and hand-builds it. ---
    await player.getByRole('button', { name: 'Characters', exact: true }).click();
    await player.getByLabel('New character name').fill('Valeria');
    await player.getByRole('button', { name: 'Create character' }).click();
    // It opens by itself once the server has created it.
    await expect(
      player.getByRole('heading', { name: 'Valeria', level: 3 }),
    ).toBeVisible();

    await player.getByRole('button', { name: 'Edit character' }).click();
    await setNumber(player, 'Strength', '4');
    await player.getByLabel('Athletics rank').selectOption('trained');
    await player.getByRole('button', { name: 'Done editing' }).click();

    // Str +4, trained at level 1 is +3: Athletics +7, worked out by hand.
    await expect(skillTotal(player, 'Athletics')).toHaveText('+7');

    // --- The GM sees the new character, and adds it to the party. ---
    await gm.getByRole('button', { name: 'Characters', exact: true }).click();
    await expect(gm.getByRole('button', { name: /Valeria/ })).toBeVisible();
    await gm.getByText('Manage party').click();
    await gm.getByLabel('Add to party').selectOption({ label: 'Valeria (character)' });
    await gm.getByRole('button', { name: 'Add', exact: true }).click();

    // Both party bars show her, with no refresh.
    for (const page of [gm, player]) {
      await expect(
        page.locator('.party-member').filter({ hasText: 'Valeria' }),
      ).toBeVisible();
    }

    // The GM opens her sheet and sees the player's edit, built before the GM looked.
    await gm.locator('.party-member').filter({ hasText: 'Valeria' }).click();
    await expect(skillTotal(gm, 'Athletics')).toHaveText('+7');

    // --- A condition changes a number, on both screens, live. ---
    await player.getByLabel('Condition name').fill('frightened');
    await player.getByLabel('Value (if it has one)').fill('2');
    await player.getByRole('button', { name: 'Add condition' }).click();

    // Frightened 2 is -2 to every check: +7 becomes +5.
    await expect(skillTotal(player, 'Athletics')).toHaveText('+5');
    await expect(skillTotal(gm, 'Athletics')).toHaveText('+5');
    await expect(
      gm.locator('.party-member').filter({ hasText: 'Frightened 2' }),
    ).toBeVisible();

    // --- A roll made by the player lands in both chats, once, as the same roll. ---
    await player.getByRole('button', { name: 'Roll Athletics' }).click();

    const card = (page: Page) =>
      page.locator('.roll-card').filter({ hasText: 'Valeria: Athletics' });
    await expect(card(player)).toBeVisible();
    await expect(card(gm)).toBeVisible();
    await expect(card(gm)).toHaveCount(1);

    const playerTotal = await card(player).locator('.total').textContent();
    const gmTotal = await card(gm).locator('.total').textContent();
    expect(gmTotal).toBe(playerTotal);
    // d20 + 5 is 6 to 25.
    expect(Number(gmTotal)).toBeGreaterThanOrEqual(6);
    expect(Number(gmTotal)).toBeLessThanOrEqual(25);
    await expect(card(gm)).toContainText('rolled by Valeros');
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
