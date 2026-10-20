/**
 * Milestone 8(b)'s primary flow: a player builds a Cleric with the guided creator,
 * choosing a Divine Font and spells, then casts from the font, and the slot spent
 * shows on both screens with the cast's card in both chats. Two independent
 * `BrowserContext`s stand in for two machines. The compendium is the creator's
 * invented fixture (`creator/fixtures/`, see `playwright.creator.config.ts`): the
 * font's two spells sit under the `heal` and `harm` slugs the PF2e system's grant
 * table names, with invented names and text, never Paizo content.
 *
 * The numbers, worked out by hand from the fixture (level 1, trained = 2 + 1):
 *   attributes   wis +4 (ancestry free, background free, key, free)
 *                con +2   dex +2   cha +1   str +0   int +0
 *   hit points   8 ancestry + (8 class + 2 con) = 18
 *   Will         4 + expert 5 = +9
 *   spells       attack 4 + trained 3 = +7, DC 10 + 7 = 17
 *   Divine Font  4 slots at rank 1, each holding Invented Mend (slug `heal`)
 */
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  openFromGearMenu,
  waitForConnected,
} from '../tests/helpers.js';

/** The headline number under `label` on the open sheet (`AC`, `Will`, ...). */
function keyStat(sheet: Locator, label: string): Locator {
  return sheet
    .locator('.key-stats li')
    .filter({ has: sheet.page().getByText(label, { exact: true }) })
    .locator('strong');
}

/** Picks the radio or toggle whose label starts with `text`, inside `scope`. */
async function choose(scope: Locator, text: string): Promise<void> {
  await scope.locator('label', { hasText: text }).locator('input').first().check();
}

/** Goes to a step by its rail button, whose name is the step's number and label ("3 Class"). */
async function step(dialog: Locator, name: string): Promise<void> {
  await dialog
    .getByRole('navigation')
    .getByRole('button', { name: new RegExp(`^\\d+\\s*${name}$`) })
    .click();
}

test('a player builds a Cleric, casts from the Divine Font, and the GM sees the slot spent', async ({
  browser,
}) => {
  const campaignName = `E2E Cleric ${crypto.randomUUID()}`;
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();

  try {
    // --- A table: a GM and one player, both seated. ---
    await createAndActivateCampaign(gm, campaignName);
    await waitForConnected(gm);
    await addSeat(gm, 'Game Master', true);
    await addSeat(gm, 'Kyra', false);
    await claimSeat(gm, 'Game Master');
    await player.goto('/');
    await waitForConnected(player);
    await claimSeat(player, 'Kyra');

    // --- The player builds a Cleric. ---
    await openFromGearMenu(player, 'Characters');
    await player.getByRole('button', { name: 'Guided creation…' }).click();
    const dialog = player.getByRole('dialog', { name: 'Create a character' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Character name').fill('Ilsa');

    await choose(dialog, 'Invented Folk');
    await choose(dialog, 'Invented Heritage');

    await step(dialog, 'Background');
    await choose(dialog, 'Invented Trade');

    await step(dialog, 'Class');
    await choose(dialog, 'Invented Cleric');

    await step(dialog, 'Class choices');
    await choose(dialog, 'Healing Font');

    await step(dialog, 'Attributes');
    const section = (title: string) =>
      dialog.locator('fieldset').filter({ has: player.getByText(title) });
    await section('Invented Folk boosts').getByRole('button', { name: 'Wisdom' }).click();
    await section('Invented Trade boost')
      .getByRole('button', { name: 'Dexterity' })
      .click();
    await section('Invented Trade free boost')
      .getByRole('button', { name: 'Wisdom' })
      .click();
    const free = section('Free boosts');
    for (const attribute of ['Wisdom', 'Constitution', 'Dexterity', 'Charisma']) {
      await free.getByRole('button', { name: attribute }).click();
    }
    await expect(dialog.locator('.modifiers')).toContainText('+4');

    await step(dialog, 'Skills');
    for (const skill of ['Diplomacy', 'Medicine']) {
      await dialog.locator('.skills').getByRole('button', { name: skill }).click();
    }

    await step(dialog, 'Feats');
    await choose(
      dialog.locator('fieldset', { hasText: 'Ancestry feat' }),
      'Invented Hardy',
    );

    await step(dialog, 'Spells');
    const gifts = dialog.locator('[aria-labelledby="spells-gifts-title"]');
    await expect(gifts).toContainText('Divine Font: 4 extra slots at your highest rank');
    for (const cantrip of ['Invented Glow', 'Invented Spark']) {
      await dialog.getByRole('checkbox', { name: `Choose ${cantrip}` }).check();
    }
    await dialog.getByRole('checkbox', { name: 'Choose Invented Ward' }).check();
    await expect(dialog.locator('fieldset.picks').first()).toContainText('2 of 5 chosen');

    await step(dialog, 'Review');
    await expect(dialog.locator('.summary')).toContainText('Invented Cleric');
    await dialog.getByRole('button', { name: 'Create character' }).click();

    // --- The new sheet: the hand-worked numbers, and the font ready to cast. ---
    await expect(dialog).toBeHidden();
    const sheet = player.locator('#sheet-pane');
    await expect(sheet.getByRole('heading', { name: 'Ilsa', level: 3 })).toBeVisible();
    await expect(keyStat(sheet, 'Will')).toHaveText('+9');
    await expect(sheet.getByRole('meter', { name: 'Hit points' })).toHaveAttribute(
      'aria-valuemax',
      '18',
    );

    await sheet.getByRole('tab', { name: 'Spells' }).click();
    const main = sheet.getByRole('region', { name: 'Invented Cleric spellcasting' });
    await expect(
      main.getByRole('button', {
        name: 'Invented Cleric spellcasting spell attack: show breakdown',
      }),
    ).toHaveText('+7');
    await expect(
      main.getByRole('button', {
        name: 'Invented Cleric spellcasting spell DC: show breakdown',
      }),
    ).toHaveText('17');
    await expect(main.getByRole('region', { name: 'Cantrips' })).toContainText(
      'Invented Glow',
    );
    const font = sheet.getByRole('region', { name: 'Divine Font' });
    await expect(font.getByRole('list', { name: 'Spell slots' })).toContainText(
      '4 of 4 left',
    );

    // --- Casting one spends a slot, and the card names the spell and its DC. ---
    await font.getByRole('button', { name: 'Cast Invented Mend' }).first().click();
    await expect(font.getByRole('list', { name: 'Spell slots' })).toContainText(
      '3 of 4 left',
    );
    await expect(
      font.getByRole('button', { name: 'Cast again Invented Mend' }),
    ).toHaveCount(1);
    for (const page of [player, gm]) {
      await expect(
        page.locator('li.message').filter({ hasText: 'Ilsa cast Invented Mend' }),
      ).toContainText('DC 17');
    }

    // --- The GM's copy of the sheet shows the same slot spent. ---
    await openFromGearMenu(gm, 'Characters');
    await gm.getByRole('button', { name: 'Ilsa (character)' }).click();
    const gmSheet = gm.locator('#sheet-pane');
    await gmSheet.getByRole('tab', { name: 'Spells' }).click();
    await expect(
      gmSheet
        .getByRole('region', { name: 'Divine Font' })
        .getByRole('list', { name: 'Spell slots' }),
    ).toContainText('3 of 4 left');
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
