/**
 * Steps the e2e specs share: starting a campaign, adding and claiming seats.
 * Each spec still owns its own two `BrowserContext`s, so these take a `Page`.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export function campaignRow(page: Page, name: string): Locator {
  return page.locator('li.campaign-row').filter({ hasText: name });
}

export function seatRow(page: Page, name: string): Locator {
  return page.locator('li.seat-row').filter({ hasText: name });
}

/**
 * Starts a campaign and leaves the page showing its lobby. The server's active
 * world is process-wide, and no spec here ever leaves one, so only the first
 * spec in a run finds the campaign list; a later one finds the previous spec's
 * lobby. The first path drives the real UI (that flow is milestone 1's own
 * coverage); the second does the same two steps over HTTP, which also
 * disconnects the old world's sockets, exactly as a GM activating another
 * campaign (or leaving one, `POST /api/worlds/active/deactivate`) would.
 */
export async function createAndActivateCampaign(page: Page, name: string): Promise<void> {
  await page.goto('/');
  const createField = page.getByLabel('New campaign name');
  if (await createField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createField.fill(name);
    await page.getByRole('button', { name: 'Create campaign' }).click();
    await expect(campaignRow(page, name)).toBeVisible();
    await campaignRow(page, name).getByRole('button', { name: 'Activate' }).click();
  } else {
    const created = await page.request.post('/api/worlds', { data: { name } });
    expect(created.ok()).toBe(true);
    const world = (await created.json()) as { id: string };
    const activated = await page.request.post(`/api/worlds/${world.id}/activate`);
    expect(activated.ok()).toBe(true);
    await page.goto('/');
  }
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

export async function waitForConnected(page: Page): Promise<void> {
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}

export async function addSeat(page: Page, name: string, isGM: boolean): Promise<void> {
  await page.getByLabel('Character name').fill(name);
  if (isGM) {
    await page.getByLabel('GM seat').check();
  }
  await page.getByRole('button', { name: 'Add seat' }).click();
  await expect(seatRow(page, name)).toBeVisible();
}

export async function claimSeat(page: Page, name: string): Promise<void> {
  await seatRow(page, name).getByRole('button', { name: 'Claim' }).click();
  // Holding a seat opens the table; the seat list folds into "Seats".
  await expect(page.getByText(`Playing as ${name}`)).toBeVisible();
}

/**
 * Opens the seat roster: the unseated lobby's own `<details>` (folded open
 * already, but not every caller can assume that), or, once seated, the
 * gear menu's "Seats" drawer (ADR 0022's map-first shell leaves no roster
 * in the page outside it).
 */
export async function openSeats(page: Page): Promise<void> {
  const details = page.locator('details.seat-manager');
  if ((await details.count()) > 0) {
    if ((await details.getAttribute('open')) === null) {
      await details.locator('summary').click();
    }
    return;
  }
  const pane = page.locator('#seats-pane');
  if ((await pane.count()) === 0 || !(await pane.isVisible())) {
    await openFromGearMenu(page, 'Seats');
  }
}

/**
 * Opens the gear menu (`GearMenu.vue`) and clicks the item labelled `label`
 * -- the Characters, Scenes, and Rules drawers, and "Release seat", all
 * moved here (ADR 0022's map-first shell leaves no toolbar row for them).
 */
export async function openFromGearMenu(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Table menu' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}
