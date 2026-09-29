/**
 * Milestone 1's primary flow (CLAUDE.md's Definition of done, and this
 * milestone's own plan): a GM activates a campaign, a player joins its
 * lobby and claims a seat, the GM sees that live without a refresh, and a
 * `/roll` is a real dice roll both of them see the same total for. Two
 * independent `BrowserContext`s stand in for two separate machines --
 * neither shares cookies, `localStorage`, or (per `realtime/deviceToken.ts`,
 * ADR 0007) a device token with the other.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

function campaignRow(page: Page, name: string): Locator {
  return page.locator('li.campaign-row').filter({ hasText: name });
}

function seatRow(page: Page, name: string): Locator {
  return page.locator('li.seat-row').filter({ hasText: name });
}

async function createAndActivateCampaign(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('New campaign name').fill(name);
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(campaignRow(page, name)).toBeVisible();
  await campaignRow(page, name).getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

async function waitForConnected(page: Page): Promise<void> {
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}

async function addSeat(page: Page, name: string, isGM: boolean): Promise<void> {
  await page.getByLabel('Character name').fill(name);
  if (isGM) {
    await page.getByLabel('GM seat').check();
  }
  await page.getByRole('button', { name: 'Add seat' }).click();
  await expect(seatRow(page, name)).toBeVisible();
}

async function claimSeat(page: Page, name: string): Promise<void> {
  await seatRow(page, name).getByRole('button', { name: 'Claim' }).click();
  await expect(seatRow(page, name).getByText('You', { exact: true })).toBeVisible();
}

async function sendChat(page: Page, text: string): Promise<void> {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('GM activates a campaign; a player joins, claims a seat, and they roll dice together live', async ({
  browser,
}) => {
  const campaignName = `E2E Campaign ${crypto.randomUUID()}`;

  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gmPage = await gmContext.newPage();
  const playerPage = await playerContext.newPage();

  try {
    await createAndActivateCampaign(gmPage, campaignName);
    await waitForConnected(gmPage);

    await addSeat(gmPage, 'Game Master', true);
    await addSeat(gmPage, 'Valeros', false);
    await claimSeat(gmPage, 'Game Master');

    // The player never sees CampaignSelect at all -- the campaign is already
    // active server-side by the time they load the app.
    await playerPage.goto('/');
    await expect(
      playerPage.getByRole('heading', { name: campaignName, level: 2 }),
    ).toBeVisible();
    await waitForConnected(playerPage);

    await expect(seatRow(playerPage, 'Valeros')).toBeVisible();
    await claimSeat(playerPage, 'Valeros');

    // The GM's own window updates from the player's claim live, unprompted.
    await expect(
      seatRow(gmPage, 'Valeros').getByText('Claimed', { exact: true }),
    ).toBeVisible();

    await sendChat(playerPage, '/roll 1d20+7');

    const gmRoll = gmPage
      .locator('li.message')
      .filter({ hasText: 'Valeros rolled 1d20+7' });
    const playerRoll = playerPage
      .locator('li.message')
      .filter({ hasText: 'Valeros rolled 1d20+7' });
    await expect(gmRoll).toBeVisible();
    await expect(playerRoll).toBeVisible();

    // The same roll, not two independent ones: both windows must show the
    // exact same total, since the server rolls once and broadcasts the
    // result -- it never lets either client roll for itself.
    const gmTotal = await gmRoll.locator('.roll-breakdown summary').textContent();
    const playerTotal = await playerRoll.locator('.roll-breakdown summary').textContent();
    expect(gmTotal).not.toBeNull();
    expect(gmTotal).toBe(playerTotal);

    await sendChat(gmPage, 'Nice roll!');
    await expect(playerPage.getByText('Nice roll!')).toBeVisible();
  } finally {
    await gmContext.close();
    await playerContext.close();
  }
});
