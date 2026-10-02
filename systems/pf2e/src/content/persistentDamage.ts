/**
 * Persistent damage on an actor: damage that hurts again at the end of its
 * bearer's turn until a flat check ends it -- see `docs/conditions.md`
 * ("Persistent damage") and `rules/persistentDamage.ts`.
 *
 * It is a **list of its own**, not a condition. A character holds one entry per
 * condition, but persistent damage stacks by damage type (fire and bleed
 * together), so it cannot share that rule. Absent means none, so an actor stored
 * before this existed is unchanged and nothing needed migrating.
 */

import { idSchema } from '@hearthtable/core';
import { parse } from '@hearthtable/dice/pure';
import { z } from 'zod';

/**
 * The average of a plain dice formula (`1d6`, `2d6+3`, a flat `5`), or
 * `undefined` for anything else (a reference, a keep/drop/reroll/explode
 * modifier, or something that does not parse). Persistent damage is always a
 * plain formula, and its average is how two of one type are compared.
 */
export function averageDamage(formula: string): number | undefined {
  const parsed = parse(formula);
  if (!parsed.ok) {
    return undefined;
  }
  let total = 0;
  for (const { sign, term } of parsed.expression.terms) {
    let value: number;
    if (term.kind === 'integer') {
      value = term.value;
    } else if (term.kind === 'dice' && term.modifiers.length === 0) {
      value = (term.count * (term.faces + 1)) / 2;
    } else {
      return undefined;
    }
    total += sign === '-' ? -value : value;
  }
  return total;
}

export const persistentDamageSchema = z.object({
  id: idSchema,
  /** A plain dice formula: `1d6`, `2d6+3`. */
  formula: z.string().refine((value) => averageDamage(value) !== undefined, {
    message: 'a plain dice formula such as 1d6 or 2d6+3',
  }),
  /** The damage type ("fire", "bleed"); one entry per type (`addPersistentDamage`). */
  damageType: z.string().min(1),
  /** What caused it, for the table's information. */
  source: z.string().min(1).optional(),
});

export type PersistentDamage = z.infer<typeof persistentDamageSchema>;
