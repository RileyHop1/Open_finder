/**
 * The class resources the sheet keeps count of (`docs/class-resources.md`): pools a
 * class refills at its daily preparations, and what it makes then. Only the
 * Alchemist has any in the core books' level 1 build: versatile vials (2 + its
 * Intelligence modifier) and Advanced Alchemy (4 + its Intelligence modifier
 * infused items each day). Checked against the pinned upstream text (2026-10-20),
 * not against Archives of Nethys: (confirm).
 *
 * The formula book's starting size is here too (`formulaBookSize`).
 *
 * Sizes are worked out from the character on every read, so a change to
 * Intelligence shows at once; only how much is spent is stored
 * (`CharacterData.resources`), with an optional hand-set maximum as the GM's
 * override. Spending past the maximum is never refused (ADR 0023).
 */

import type { Attribute } from '../content/common.js';
import type { CharacterData } from '../content/character.js';

export interface ClassResource {
  /** The key it is stored under in `CharacterData.resources`. */
  readonly key: string;
  readonly name: string;
  /** The pool's size from the class and attributes (at least 0). */
  readonly derivedMax: number;
  /** The size in effect: a hand-set one when there is one, else `derivedMax`. */
  readonly max: number;
  readonly used: number;
  /** What is left, never below 0. */
  readonly left: number;
  /** How far past the maximum it has been spent (0 when it has not). */
  readonly over: number;
  /** How many come back outside daily preparations, and how, when some do. */
  readonly regain?: { readonly amount: number; readonly how: string };
}

interface PoolRule {
  readonly key: string;
  readonly name: string;
  readonly max: (attributes: Readonly<Record<Attribute, number>>) => number;
  readonly regain?: { readonly amount: number; readonly how: string };
}

const POOLS: Readonly<Record<string, readonly PoolRule[]>> = {
  alchemist: [
    {
      key: 'versatile-vials',
      name: 'Versatile vials',
      max: (a) => 2 + a.int,
      regain: { amount: 2, how: 'for every 10 minutes of exploration' },
    },
  ],
};

/** The pools `data`'s class keeps, with what is spent of each. None for a class with none. */
export function classResources(data: CharacterData): ClassResource[] {
  const rules = POOLS[classSlugOf(data)] ?? [];
  return rules.map((rule) => {
    const stored = data.resources[rule.key];
    const derivedMax = Math.max(0, rule.max(data.attributes));
    const max = stored?.max ?? derivedMax;
    const used = stored?.used ?? 0;
    return {
      key: rule.key,
      name: rule.name,
      derivedMax,
      max,
      used,
      left: Math.max(0, max - used),
      over: Math.max(0, used - max),
      ...(rule.regain === undefined ? {} : { regain: rule.regain }),
    };
  });
}

/** How many infused items `data`'s class makes at its daily preparations, or none. */
export function dailyCrafting(
  data: CharacterData,
): { readonly name: string; readonly count: number } | undefined {
  return classSlugOf(data) === 'alchemist'
    ? { name: 'Advanced alchemy', count: Math.max(0, 4 + data.attributes.int) }
    : undefined;
}

/** The class's slug: its compendium source's, else its name (a hand-built "Alchemist"). */
function classSlugOf(data: CharacterData): string {
  return (data.class?.source?.slug ?? data.class?.name ?? '').toLowerCase();
}

/**
 * How many formulas `data`'s class starts its formula book with at its level: an
 * Alchemist's 8 at level 1 (4 from Alchemical Crafting, 2 from its research field, 2
 * of its own) and 2 more each level after. A guide for the sheet, never a limit; none
 * for a class without a formula book.
 */
export function formulaBookSize(data: CharacterData): number | undefined {
  return classSlugOf(data) === 'alchemist' ? 8 + 2 * (data.level - 1) : undefined;
}
