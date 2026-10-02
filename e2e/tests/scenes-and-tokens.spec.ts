/**
 * Milestone 4's primary flow: a GM builds two scenes and an exit between them,
 * moves the party in, and places tokens; a player moves their own token by the
 * keyboard and the GM sees it land. Two independent `BrowserContext`s stand in
 * for two machines (see `lobby-and-chat.spec.ts`), driven through the real
 * client, server, and socket.
 *
 * It is keyboard-only where the app offers a keyboard route (the token list
 * and the exit list), which is also the accessibility check: the map is a
 * canvas, and a person with no pointer reaches everything through the list.
 *
 * What a token move looks like to the *other* screen is the distance the token
 * list gives from the selected token ("Valeria, 5 ft away"), read off the GM's
 * screen after the player moves.
 *
 * The "a player cannot move a monster" case uses a character the GM made, which
 * the player does not own, rather than a compendium creature: the config points
 * the server at an empty compendium on purpose (nothing here depends on what a
 * contributor has imported), and ownership is the same rule either way
 * (`tokens.test.ts` holds the creature-specific half on the server).
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  waitForConnected,
} from './helpers.js';

/** A token's (or exit's) button in the keyboard list, found by what it says. */
function listButton(page: Page, text: RegExp | string): Locator {
  return page.locator('.token-list li > button:not(.sheet)').filter({ hasText: text });
}

/** Selects a token the way a keyboard does: focus its button and press Enter. */
async function selectByKeyboard(page: Page, name: RegExp | string): Promise<void> {
  const button = listButton(page, name);
  await button.focus();
  await page.keyboard.press('Enter');
}

function sceneRow(page: Page, name: string): Locator {
  return page.locator('li.scene-row').filter({ hasText: name });
}

async function makeCharacter(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Characters', exact: true }).click();
  await page.getByLabel('New character name').fill(name);
  await page.getByRole('button', { name: 'Create character' }).click();
  await expect(page.getByRole('heading', { name, level: 3 })).toBeVisible();
}

async function makeScene(page: Page, name: string, kind: string): Promise<void> {
  await page.getByLabel('New scene name').fill(name);
  await page.locator('#new-scene-kind').selectOption({ label: kind });
  await page.getByRole('button', { name: 'Create scene' }).click();
  await expect(sceneRow(page, name)).toBeVisible();
}

test('a GM builds scenes and an exit, a player moves their token, and the party moves on', async ({
  browser,
}) => {
  const campaignName = `E2E Scenes ${crypto.randomUUID()}`;
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

    // --- Two characters: the player's own, and one only the GM owns. ---
    await makeCharacter(player, 'Valeria');
    await makeCharacter(gm, 'Brute');
    await gm.getByRole('button', { name: 'Close' }).click();

    // --- Before the party has a scene, nobody is shown a map, and a player has
    // no scene tools at all. ---
    await expect(player.getByText('No scene is showing yet.')).toBeVisible();
    await expect(player.getByRole('button', { name: 'Scenes', exact: true })).toHaveCount(
      0,
    );

    // --- The GM builds two scenes and an exit from one to the other. ---
    await gm.getByRole('button', { name: 'Scenes', exact: true }).click();
    await makeScene(gm, 'Tavern', 'Area');
    await makeScene(gm, 'Cellar', 'Battle map');

    await sceneRow(gm, 'Tavern').getByRole('button', { name: 'Edit' }).click();
    await gm.getByLabel('Exit label').fill('Stairs down');
    await gm.getByLabel('Leads to').selectOption({ label: 'Cellar' });
    await gm.getByRole('button', { name: 'Add exit' }).click();
    await expect(gm.getByText('Stairs down to Cellar')).toBeVisible();

    // --- Moving the party shows the Tavern on both screens. ---
    await sceneRow(gm, 'Tavern').getByRole('button', { name: 'Move party here' }).click();
    await expect(sceneRow(gm, 'Tavern').getByText('Party is here')).toBeVisible();
    await expect(player.locator('.map-surface')).toBeVisible();
    await expect(player.getByText('No scene is showing yet.')).toHaveCount(0);

    // --- The GM places both characters on the map. ---
    await gm.getByRole('button', { name: 'Characters', exact: true }).click();
    await gm.getByRole('button', { name: 'Place Valeria on the map' }).click();
    await gm.getByRole('button', { name: 'Place Brute on the map' }).click();
    await expect(player.locator('.token-list li')).toHaveCount(2);

    // --- The player may move their own token and not the GM's. ---
    await expect(listButton(player, 'Valeria')).toHaveAttribute(
      'title',
      'Select, then the arrow keys move it',
    );
    await expect(listButton(player, 'Brute')).toHaveAttribute('title', 'Select');

    // The GM selects Brute; every other token then says how far away it is.
    await selectByKeyboard(gm, 'Brute');
    const startFeet = await (async () => {
      const text = (await listButton(gm, /^Valeria/).textContent()) ?? '';
      const found = /(\d+) ft away/.exec(text);
      expect(found, `no distance in "${text}"`).not.toBeNull();
      return Number(found?.[1]);
    })();

    // The player tries Brute first: selecting works, moving does nothing.
    await selectByKeyboard(player, 'Brute');
    await player.keyboard.press('ArrowRight');
    await expect(listButton(gm, /^Valeria/)).toHaveText(
      new RegExp(`${startFeet} ft away`),
    );

    // Then their own: one step right, and the GM's screen shows the new distance.
    await selectByKeyboard(player, 'Valeria');
    await player.keyboard.press('ArrowRight');
    await expect(
      player.getByRole('status').filter({ hasText: 'Valeria moved' }),
    ).toHaveText(/Valeria moved \d+ ft\./);
    await expect(listButton(gm, /^Valeria/)).not.toHaveText(
      new RegExp(`^Valeria, ${startFeet} ft away`),
    );

    // --- Exits are the GM's: the player's list has none. ---
    await expect(
      gm.getByRole('button', { name: 'Exit: Stairs down, to Cellar' }),
    ).toHaveCount(1);
    await expect(player.getByRole('button', { name: /^Exit:/ })).toHaveCount(0);

    // The drawers cover the map's corner, so put them away first.
    for (const close of await gm.locator('.drawer-close').all()) {
      if (await close.isVisible()) {
        await close.click();
      }
    }

    // --- Taking the exit asks first, then moves the party on both screens. ---
    await selectByKeyboard(gm, 'Exit: Stairs down');
    const question = gm.getByRole('alertdialog');
    await expect(question).toContainText('Move the party to');
    await question.getByRole('button', { name: 'Move the party' }).click();
    await expect(player.locator('.token-list li')).toHaveCount(0);
    await expect(gm.locator('.token-list li').filter({ hasText: 'Valeria' })).toHaveCount(
      0,
    );
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
