/** Small display helpers for the character sheet. Pure, so they are tested without mounting anything. */

import { copperToCoins } from '@hearthtable/pf2e';

/** `+3`, `-1`, `+0`: a bonus always shows its sign. */
export function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

/** `350` -> "3 gp, 5 sp"; `0` -> "0 cp". Drops empty denominations, but never drops every one. */
export function formatPrice(copperAmount: number): string {
  const coins = copperToCoins(copperAmount);
  const parts = (['pp', 'gp', 'sp', 'cp'] as const)
    .filter((denomination) => coins[denomination] > 0)
    .map((denomination) => `${coins[denomination]} ${denomination}`);
  return parts.length > 0 ? parts.join(', ') : '0 cp';
}

/**
 * An item's own Bulk, PF2e-style: `0` reads as "—" (negligible), `0.1` as
 * "L" (light), anything else as the number. Distinct from a *total* Bulk
 * (an item count summed with coins), which is never negligible/light and
 * is shown as a plain rounded number instead -- see `formatTotalBulk`.
 */
export function formatItemBulk(bulk: number): string {
  if (bulk === 0) {
    return '—';
  }
  return bulk === 0.1 ? 'L' : String(Math.round(bulk * 10) / 10);
}

/** A running total of Bulk (items plus coins): one decimal place, no "L"/"—" shorthand. */
export function formatTotalBulk(bulk: number): string {
  return String(Math.round(bulk * 10) / 10);
}

/** `academia-lore` -> `Academia Lore`; `skill:athletics` -> `Athletics`. */
export function titleCase(slug: string): string {
  const name = slug.startsWith('skill:') ? slug.slice('skill:'.length) : slug;
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
