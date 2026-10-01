/**
 * Condition operations on a character: add (merge), set (the GM override), and
 * remove. Each is an edit function handed to `editCharacter` (`actors.ts`),
 * so ownership, validation, and storage are the one path every sheet change
 * takes; the merge and clearing rules themselves are
 * `rules/conditionMerge.ts` in `systems/pf2e`.
 *
 * **Unknown conditions.** Once a compendium has been imported its condition
 * definitions are the list of valid slugs, and anything else is refused (a
 * typo should not become a permanent invisible condition). Before anything
 * has been imported there is no list to check against, so any well-formed slug
 * is accepted; the sheet still works, and a condition we have no definition for
 * contributes no modifier (`docs/conditions.md`).
 */

import type { Actor, Seat } from '@hearthtable/core';
import { addCondition, removeCondition, setCondition } from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

interface ConditionPayload {
  actorId: string;
  slug: string;
  value?: number | undefined;
}

/** `{ slug, value }` with `value` left out entirely when absent (`exactOptionalPropertyTypes`). */
function applied(payload: ConditionPayload): { slug: string; value?: number } {
  return payload.value === undefined
    ? { slug: payload.slug }
    : { slug: payload.slug, value: payload.value };
}

function requireKnown(compendium: CompendiumIndex, slug: string): void {
  const definitions = compendium.conditions();
  if (definitions.size > 0 && !definitions.has(slug)) {
    throw new OperationRejected(`unknown condition: ${slug}`);
  }
}

/** Adds a condition, keeping the higher value if the character already has it and clearing what it supersedes. */
export function addConditionToActor(
  store: WorldStore,
  seat: Seat,
  compendium: CompendiumIndex,
  payload: ConditionPayload,
): Actor {
  requireKnown(compendium, payload.slug);
  return editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    conditions: addCondition(data.conditions, applied(payload), compendium.conditions()),
  }));
}

/** Sets a condition to exactly `payload.value` (0 removes it): the manual override. */
export function setConditionOnActor(
  store: WorldStore,
  seat: Seat,
  compendium: CompendiumIndex,
  payload: ConditionPayload,
): Actor {
  requireKnown(compendium, payload.slug);
  return editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    conditions: setCondition(data.conditions, applied(payload), compendium.conditions()),
  }));
}

/** Removes a condition. Removing one the character does not have is not an error: the sheet is already as asked. */
export function removeConditionFromActor(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string; slug: string },
): Actor {
  return editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    conditions: removeCondition(data.conditions, payload.slug),
  }));
}
