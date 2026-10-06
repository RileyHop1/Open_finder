/**
 * Milestone 6's primary flow (CLAUDE.md's "Learn as you play"): the Rules
 * drawer's search surfaces a real compendium entry as its own tooltip chip,
 * that tooltip nests (a condition's text links one of its traits, which
 * opens its own popover rather than replacing the first), and a sheet
 * number's breakdown opens on click.
 *
 * Driven through the real client, server, and a hand-authored (non-Paizo)
 * fixture compendium -- `rules/fixtures/`, one condition and one trait, in
 * the shape the real importer writes (ADR 0012). The main suite's server
 * runs with an empty compendium on purpose (`playwright.config.ts`, ADR
 * 0013), so this spec gets its own `webServer` via `playwright.rules.config.ts`,
 * the same way `combat-turn.spec.ts` does for its own weapon fixture.
 *
 * One page is enough: this is about the UI mechanics (search, nested
 * popovers, breakdowns), not cross-client sync, which
 * `character-and-party.spec.ts` already covers.
 */
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  openFromGearMenu,
  waitForConnected,
} from '../tests/helpers.js';

test('the Rules drawer finds a condition, its tooltip nests a trait, and AC shows its breakdown', async ({
  page,
}) => {
  const campaignName = `E2E Rules ${crypto.randomUUID()}`;
  await createAndActivateCampaign(page, campaignName);
  await waitForConnected(page);
  await addSeat(page, 'Game Master', true);
  await addSeat(page, 'Valeros', false);
  await claimSeat(page, 'Valeros');

  // --- A character to open a sheet on. ---
  await openFromGearMenu(page, 'Characters');
  await page.getByLabel('New character name').fill('Valeria');
  await page.getByRole('button', { name: 'Create character' }).click();
  await expect(page.getByRole('heading', { name: 'Valeria', level: 3 })).toBeVisible();

  // --- `?` opens the Rules drawer, alongside the still-open character sheet
  // (the viewport here is wide enough for both -- `playwright.rules.config.ts`).
  // `?` is ignored while typing, and nothing here is a text input regardless. ---
  await page.keyboard.press('?');
  await expect(
    page.getByRole('heading', { name: 'Rules', level: 2, exact: true }),
  ).toBeVisible();

  // --- Searching finds the fixture condition, rendered as its own tooltip chip. ---
  await page
    .getByLabel('Search pages, spells, feats, conditions, actions, and traits')
    .fill('frightened');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const frightenedChip = page.getByRole('button', { name: 'Frightened', exact: true });
  await expect(frightenedChip).toBeVisible();

  // --- Hovering opens its tooltip, which links a nested trait. ---
  await frightenedChip.hover();
  await expect(page.getByText('You are gripped by fear')).toBeVisible();
  const mentalChip = page.getByRole('button', { name: 'mental', exact: true });
  await expect(mentalChip).toBeVisible();

  // --- Hovering it opens its own popover, stacked on top rather than replacing the first. ---
  await mentalChip.hover();
  await expect(page.getByText('A mental effect works only against')).toBeVisible();
  await expect(page.getByText('You are gripped by fear')).toBeVisible();

  // --- Escape closes the innermost popover first, leaving the outer one open --
  // `press` focuses the trigger before the key, so this is the innermost one's
  // own handler, not whichever element happened to be focused already. ---
  await mentalChip.press('Escape');
  await expect(page.getByText('A mental effect works only against')).toBeHidden();
  await expect(page.getByText('You are gripped by fear')).toBeVisible();

  // --- Close the Rules drawer, then click AC on the still-open sheet to see its own breakdown. ---
  await page.locator('#rules-pane .drawer-close').click();
  await page.getByRole('button', { name: 'Armor Class: show breakdown' }).click();
  await expect(
    page.getByRole('heading', { name: 'Armor Class', level: 4 }),
  ).toBeVisible();
  await expect(page.locator('.stat-popover')).toContainText('Bonus');
});
