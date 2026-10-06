/**
 * Milestone 5's primary flow (D.2): before combat a token moves freely; the
 * GM starts combat and everyone rolls initiative; the turn bar shows the
 * order and shifts on end turn; the GM reorders by keyboard (the initiative
 * override, `TurnBar.vue`); a player cannot move out of turn, a GM grant
 * lets them move once anyway, and they can move normally once it is their
 * turn; a strike shows its precomputed MAP variants; and a condition with a
 * `turn` duration disappears once its boundary passes.
 *
 * Two independent `BrowserContext`s stand in for two machines (see
 * `lobby-and-chat.spec.ts`), driven through the real client, server and
 * socket. It runs against `playwright.combat.config.ts`'s own server, whose
 * compendium is a hand-authored fixture (see that file), not the main
 * suite's -- the one thing this spec needs that an empty compendium cannot
 * give: a real weapon so a strike is something a player can actually click.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  openFromGearMenu,
  waitForConnected,
} from '../tests/helpers.js';

/** A token's button in the keyboard list, found by what it says. */
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

async function makeScene(page: Page, name: string, kind: string): Promise<void> {
  await page.getByLabel('New scene name').fill(name);
  await page.locator('#new-scene-kind').selectOption({ label: kind });
  await page.getByRole('button', { name: 'Create scene' }).click();
  await expect(sceneRow(page, name)).toBeVisible();
}

/** A combatant's row in the turn bar, found by its name. */
function turnBarRow(page: Page, name: RegExp | string): Locator {
  return page.locator('[data-testid="turn-bar"] ol li').filter({ hasText: name });
}

/** The move-refusal toast on the map, while it is showing one. */
function moveError(page: Page): Locator {
  return page.locator('.toast-notice.toast-notice--error');
}

test('a full combat turn: initiative, turn order, movement gating, a strike with MAP, and a condition expiring', async ({
  browser,
}) => {
  const campaignName = `E2E Combat ${crypto.randomUUID()}`;
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

    // --- The player builds a martial character and arms her with the
    // fixture's one weapon. ---
    await openFromGearMenu(player, 'Characters');
    await player.getByLabel('New character name').fill('Valeria');
    await player.getByRole('button', { name: 'Create character' }).click();
    await expect(
      player.getByRole('heading', { name: 'Valeria', level: 3 }),
    ).toBeVisible();

    await player.getByRole('button', { name: 'Edit character' }).click();
    const strength = player.getByLabel('Strength', { exact: true });
    await strength.fill('4');
    await strength.press('Tab');
    await player
      .locator('select[aria-label="Martial weapons rank"]')
      .selectOption('trained');
    await player.getByRole('button', { name: 'Done editing' }).click();

    await player.getByText('Add an item from the compendium').click();
    await player.locator('#compendium-kind').selectOption('weapon');
    await player.getByRole('button', { name: 'Add Longsword' }).click();
    await player.getByRole('checkbox', { name: 'Equip Longsword' }).check();
    await player.getByRole('button', { name: 'Close' }).click();

    // --- The GM makes a second combatant, adds the party, and opens a
    // battle map with both on it. ---
    await openFromGearMenu(gm, 'Characters');
    await gm.getByLabel('New character name').fill('Brute');
    await gm.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { name: 'Brute', level: 3 })).toBeVisible();
    await gm.getByRole('button', { name: 'Close' }).click();

    await gm.getByText('Manage party').click();
    await gm.getByLabel('Add to party').selectOption({ label: 'Valeria (character)' });
    await gm.getByRole('button', { name: 'Add', exact: true }).click();

    await openFromGearMenu(gm, 'Scenes');
    await makeScene(gm, 'Arena', 'Battle map');
    await sceneRow(gm, 'Arena').getByRole('button', { name: 'Move party here' }).click();
    await expect(player.locator('.map-surface')).toBeVisible();

    await openFromGearMenu(gm, 'Characters');
    await gm.getByRole('button', { name: 'Place Brute on the map' }).click();
    await expect(player.locator('.token-list li')).toHaveCount(2);

    for (const page of [gm, player]) {
      for (const close of await page.locator('.drawer-close').all()) {
        if (await close.isVisible()) {
          await close.click();
        }
      }
    }

    // --- Before combat, the player's token moves freely. ---
    await selectByKeyboard(player, 'Valeria');
    await player.keyboard.press('ArrowRight');
    await expect(
      player.getByRole('status').filter({ hasText: 'Valeria moved' }),
    ).toBeVisible();

    // --- The GM starts combat: everyone rolls, and the turn bar shows the
    // order. ---
    await gm.getByRole('button', { name: 'Start combat' }).click();
    await expect(turnBarRow(gm, 'Valeria')).toBeVisible();
    await expect(turnBarRow(gm, 'Brute')).toBeVisible();
    await expect(gm.locator('[data-testid="turn-bar"] ol li')).toHaveCount(2);
    await expect(gm.getByText('Round 1')).toBeVisible();

    // --- The GM reorders by keyboard: the initiative override moves Brute
    // to the top of the list. Reordering is about list position, not whose
    // turn it is -- that is `combat.nextTurn`'s own pointer, unaffected by it. ---
    const bruteRow = turnBarRow(gm, 'Brute');
    await bruteRow.getByLabel('Set initiative').fill('99');
    await bruteRow.getByRole('button', { name: 'Set' }).click();
    await expect(gm.locator('[data-testid="turn-bar"] ol li').first()).toContainText(
      'Brute',
    );

    // --- Whichever of them rolled first, end that turn once so it is
    // reliably Brute's: the rest of this test needs a known, not a random,
    // state to assert the movement gating against. ---
    if ((await turnBarRow(gm, 'Valeria').getAttribute('aria-current')) === 'true') {
      await gm.getByRole('button', { name: 'Next turn' }).click();
    }
    await expect(turnBarRow(gm, 'Brute')).toHaveAttribute('aria-current', 'true');

    // --- It is Brute's turn: the player cannot move Valeria out of turn. ---
    await selectByKeyboard(player, 'Valeria');
    await player.keyboard.press('ArrowRight');
    await expect(moveError(player)).toContainText("it is not this token's turn");

    // --- A GM grant lets her move once anyway. ---
    await selectByKeyboard(gm, 'Valeria');
    await gm.keyboard.press('Shift+F10');
    await gm.getByRole('menuitem', { name: 'Let this token move' }).click();
    await selectByKeyboard(player, 'Valeria');
    await player.keyboard.press('ArrowDown');
    await expect(moveError(player)).toHaveCount(0);

    // --- The GM ends Brute's turn: on Valeria's own turn she moves
    // normally, no grant needed. It is her own active turn, so the arrow key
    // plans the move instead of sending it at once; Enter commits it. ---
    await gm.getByRole('button', { name: 'Next turn' }).click();
    await expect(turnBarRow(gm, 'Valeria')).toHaveAttribute('aria-current', 'true');
    await selectByKeyboard(player, 'Valeria');
    await player.keyboard.press('ArrowRight');
    await expect(player.getByRole('status').filter({ hasText: 'planned' })).toBeVisible();
    await player.keyboard.press('Enter');
    await expect(moveError(player)).toHaveCount(0);

    // --- A strike shows its precomputed MAP variants, and rolls one. ---
    const strikes = player
      .locator('.action-bar .strikes li')
      .filter({ hasText: 'Longsword' });
    const first = strikes.getByRole('button', { name: /1st attack/ });
    const second = strikes.getByRole('button', { name: /2nd attack/ });
    const firstTotal = Number(/\+(-?\d+)$/.exec((await first.textContent()) ?? '')?.[1]);
    const secondTotal = Number(
      /\+(-?\d+)$/.exec((await second.textContent()) ?? '')?.[1],
    );
    expect(firstTotal - secondTotal).toBe(5);

    await first.click();
    await expect(
      player.getByRole('status').filter({ hasText: 'Choose a target' }),
    ).toBeVisible();
    // Swings without naming one: the roll itself (and picking a target from
    // the map or the token list) is C.6's own coverage, not this milestone
    // item's -- this only needs to show the swing actually fires.
    await player.keyboard.press('Escape');
    const card = (page: Page) =>
      page.locator('.roll-card').filter({ hasText: 'Longsword' });
    await expect(card(gm)).toBeVisible();
    await expect(card(player)).toBeVisible();

    // --- A condition with a `turn` duration disappears once that
    // combatant's turn ends. ---
    // The token list is transparent and `pointer-events: none` until something
    // inside it has focus (TokenList.vue), and selecting a token moves focus
    // back to the map so arrow keys move it -- so a plain click on "Sheet"
    // here would actually land on the map canvas underneath. Focusing the
    // button directly keeps the list visible and activates it without a
    // mouse hit-test.
    const sheetButton = player.getByRole('button', { name: 'Open the sheet of Valeria' });
    await sheetButton.focus();
    await player.keyboard.press('Enter');
    await player.getByLabel('Condition name').fill('frightened');
    await player.getByLabel('Ends').selectOption('turn');
    await player.getByLabel('Whose turn').selectOption({ label: 'Valeria' });
    await player.getByLabel('When').selectOption('end');
    await player.getByRole('button', { name: 'Add condition' }).click();
    await expect(
      gm.locator('.party-member').filter({ hasText: 'Frightened' }),
    ).toBeVisible();

    await gm.getByRole('button', { name: 'Next turn' }).click();
    await expect(turnBarRow(gm, 'Brute')).toHaveAttribute('aria-current', 'true');
    await expect(
      gm.locator('.party-member').filter({ hasText: 'Frightened' }),
    ).toHaveCount(0);
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
