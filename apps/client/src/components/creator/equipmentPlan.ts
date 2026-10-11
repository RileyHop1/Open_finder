/**
 * Starting equipment (milestone 8, `docs/character-build.md` "Starting
 * equipment"): a purse to spend on gear from the compendium, with a running
 * total. Spending more than the purse is shown as a warning and never blocked
 * (ADR 0023): a GM may grant extra funds, and the purse and items stay
 * editable on the sheet.
 *
 * The shopping list is not part of the build record: the build holds the
 * choices the derivation grants and it does not touch gear. The creator keeps
 * the list in its draft and, when the character is created, adds each item
 * and gives the change.
 */

import type { Coins } from '@hearthtable/pf2e';
import { z } from 'zod';

/** What a new level 1 character has to spend: 15 gp, in copper **(confirm)**. */
export const STARTING_COPPER = 1500;

export const equipmentLineSchema = z.object({
  packId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  /** Absent when the importer could not read a price; counted as free and flagged. */
  priceInCopper: z.number().int().nonnegative().optional(),
  quantity: z.number().int().min(1).max(99),
});

export type EquipmentLine = z.infer<typeof equipmentLineSchema>;

/** What one line costs. */
export const lineCost = (line: EquipmentLine): number =>
  (line.priceInCopper ?? 0) * line.quantity;

/** Everything on the list, in copper. */
export const totalCost = (lines: readonly EquipmentLine[]): number =>
  lines.reduce((sum, line) => sum + lineCost(line), 0);

/** The change left after buying, in copper, never negative. */
export const changeCopper = (
  lines: readonly EquipmentLine[],
  budget = STARTING_COPPER,
): number => Math.max(0, budget - totalCost(lines));

/** `copper` as gold, silver and copper (no platinum: a starting purse reads as "15 gp"). */
export function toCoins(copper: number): Coins {
  return {
    pp: 0,
    gp: Math.floor(copper / 100),
    sp: Math.floor((copper % 100) / 10),
    cp: copper % 10,
  };
}

/** The change as the purse the new character starts with. */
export const changeAfter = (
  lines: readonly EquipmentLine[],
  budget = STARTING_COPPER,
): Coins => toCoins(changeCopper(lines, budget));

/** How far over the purse the list is, in copper; 0 when it fits. */
export const overBudgetBy = (
  lines: readonly EquipmentLine[],
  budget = STARTING_COPPER,
): number => Math.max(0, totalCost(lines) - budget);

/** Lines whose price is unknown, so the total may be low. */
export const unpriced = (lines: readonly EquipmentLine[]): EquipmentLine[] =>
  lines.filter((line) => line.priceInCopper === undefined);

/** `1500` as "15 gp", `1234` as "12 gp 3 sp 4 cp"; "0 cp" for nothing. */
export function formatCopper(copper: number): string {
  const coins = toCoins(copper);
  const parts = (['gp', 'sp', 'cp'] as const)
    .filter((d) => coins[d] > 0)
    .map((d) => `${coins[d]} ${d}`);
  return parts.length === 0 ? '0 cp' : parts.join(' ');
}

/** Adds one of an item, merging with a line for the same entry. */
export function addLine(
  lines: readonly EquipmentLine[],
  item: Omit<EquipmentLine, 'quantity'>,
): EquipmentLine[] {
  const existing = lines.find((l) => l.packId === item.packId && l.slug === item.slug);
  return existing === undefined
    ? [...lines, { ...item, quantity: 1 }]
    : lines.map((l) =>
        l === existing ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l,
      );
}

/** Changes a line's quantity; zero or less removes it. */
export function setQuantity(
  lines: readonly EquipmentLine[],
  packId: string,
  slug: string,
  quantity: number,
): EquipmentLine[] {
  return lines.flatMap((l) =>
    l.packId === packId && l.slug === slug
      ? quantity <= 0
        ? []
        : [{ ...l, quantity: Math.min(99, quantity) }]
      : [l],
  );
}
