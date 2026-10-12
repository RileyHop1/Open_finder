/**
 * Milestone 8(a)'s primary flow: a player builds a character with the guided
 * creator and the GM sees it, with every number matching what the rules give by
 * hand. Two independent `BrowserContext`s stand in for two machines, driven
 * through the real client, server and socket. The compendium is a tiny invented
 * fixture (`creator/fixtures/`, see `playwright.creator.config.ts`), never
 * Paizo content.
 *
 * The numbers, worked out by hand from the fixture (level 1, so a proficiency
 * bonus is the rank's 2/4 plus 1):
 *   attributes  str +3 (background, key, free)   dex +2 (ancestry free, free)
 *               con +2 (ancestry, free)          wis +1   cha +1   int +0
 *   hit points  8 ancestry + (10 class + 2 con) = 20
 *   AC          10 + dex 2 + trained 3 = 15
 *   saves       Fortitude 2 + expert 5 = +7   Reflex 2 + 3 = +5   Will 1 + 3 = +4
 *   Perception  1 + 3 = +4
 *   skills      Athletics 3 + 3 = +6   Stealth 2 + 3 = +5   Arcana 0 + 3 = +3
 *   purse       15 gp less a sword (1 gp) and two ropes (2 sp) = 13 gp 8 sp
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

/** The headline number under `label` on the open sheet (`AC`, `Fort`, ...). */
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

test('a player builds a character with the creator and the GM sees it', async ({
  browser,
}) => {
  const campaignName = `E2E Creator ${crypto.randomUUID()}`;
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

    // --- The player walks the creator. ---
    await openFromGearMenu(player, 'Characters');
    await player.getByRole('button', { name: 'Guided creation…' }).click();
    const dialog = player.getByRole('dialog', { name: 'Create a character' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Character name').fill('Valeria');

    await choose(dialog, 'Invented Folk');
    await choose(dialog, 'Invented Heritage');

    await step(dialog, 'Background');
    await choose(dialog, 'Invented Trade');

    await step(dialog, 'Class');
    await choose(dialog, 'Invented Fighter');
    await expect(
      dialog.locator('.class-step dt', { hasText: 'Hit Points' }),
    ).toBeVisible();

    await step(dialog, 'Class choices');
    await choose(dialog, 'High Stance');

    await step(dialog, 'Attributes');
    const section = (title: string) =>
      dialog.locator('fieldset').filter({ has: player.getByText(title) });
    await section('Invented Folk boosts')
      .getByRole('button', { name: 'Dexterity' })
      .click();
    await section('Invented Trade boost')
      .getByRole('button', { name: 'Strength' })
      .click();
    await section('Invented Trade free boost')
      .getByRole('button', { name: 'Wisdom' })
      .click();
    const free = section('Free boosts');
    for (const attribute of ['Strength', 'Dexterity', 'Constitution', 'Charisma']) {
      await free.getByRole('button', { name: attribute }).click();
    }
    await expect(dialog.locator('.modifiers')).toContainText('+3');

    await step(dialog, 'Skills');
    for (const skill of ['Acrobatics', 'Arcana', 'Stealth']) {
      await dialog.locator('.skills').getByRole('button', { name: skill }).click();
    }
    await expect(dialog.locator('.count')).toContainText('3 of 3 chosen');

    await step(dialog, 'Feats');
    await choose(
      dialog.locator('fieldset', { hasText: 'Ancestry feat' }),
      'Invented Hardy',
    );
    await choose(
      dialog.locator('fieldset', { hasText: 'Class feat' }),
      'Invented Sudden Charge',
    );

    await step(dialog, 'Equipment');
    await dialog.getByRole('button', { name: 'Add Invented Sword' }).click();
    await dialog.getByRole('button', { name: 'Gear' }).click();
    await dialog.getByRole('button', { name: 'Add Invented Rope' }).click();
    await dialog.getByRole('button', { name: 'Add Invented Rope' }).click();
    await expect(dialog.locator('.budget')).toContainText('Spent 1 gp 2 sp of 15 gp');

    await step(dialog, 'Review');
    await expect(dialog.locator('.summary')).toContainText('Invented Fighter');
    await dialog.getByRole('button', { name: 'Create character' }).click();

    // --- The creator closes and the new sheet opens, with the hand-worked numbers. ---
    await expect(dialog).toBeHidden();
    const sheet = player.locator('#sheet-pane');
    await expect(sheet.getByRole('heading', { name: 'Valeria', level: 3 })).toBeVisible();
    await expect(keyStat(sheet, 'AC')).toHaveText('15');
    await expect(keyStat(sheet, 'Fort')).toHaveText('+7');
    await expect(keyStat(sheet, 'Ref')).toHaveText('+5');
    await expect(keyStat(sheet, 'Will')).toHaveText('+4');
    await expect(keyStat(sheet, 'Perception')).toHaveText('+4');
    await expect(sheet.getByRole('meter', { name: 'Hit points' })).toHaveAttribute(
      'aria-valuemax',
      '20',
    );

    await sheet.getByRole('tab', { name: 'Skills' }).click();
    const skillBonus = (name: string) =>
      sheet
        .locator('tr')
        .filter({ has: player.getByRole('rowheader', { name, exact: true }) })
        .locator('.total');
    await expect(skillBonus('Athletics')).toContainText('+6');
    await expect(skillBonus('Stealth')).toContainText('+5');
    await expect(skillBonus('Arcana')).toContainText('+3');

    await sheet.getByRole('tab', { name: 'Feats & features' }).click();
    for (const name of ['Invented Hardy', 'Invented Sudden Charge', 'High Stance']) {
      await expect(sheet.getByText(name).first()).toBeVisible();
    }
    await expect(sheet.getByText('Low Stance')).toHaveCount(0);

    await sheet.getByRole('tab', { name: 'Inventory' }).click();
    await expect(sheet.getByText('Invented Sword').first()).toBeVisible();
    await expect(sheet.getByText('Invented Rope').first()).toBeVisible();
    await expect(sheet.locator('.purse .coin').filter({ hasText: 'sp' })).toContainText(
      '8',
    );

    // --- The GM sees the same character, live, with the same numbers. ---
    await openFromGearMenu(gm, 'Characters');
    await gm.getByRole('button', { name: 'Valeria (character)' }).click();
    const gmSheet = gm.locator('#sheet-pane');
    await expect(
      gmSheet.getByRole('heading', { name: 'Valeria', level: 3 }),
    ).toBeVisible();
    await expect(keyStat(gmSheet, 'AC')).toHaveText('15');
    await expect(keyStat(gmSheet, 'Fort')).toHaveText('+7');
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
