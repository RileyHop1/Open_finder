/**
 * Condition operations on a character or a monster: add (merge), set (the GM
 * override), and remove. Each is an edit of the actor's `conditions` list. A
 * character goes through `editCharacter` (`actors.ts`), so ownership,
 * validation, and storage are the one path every sheet change takes; a monster
 * (an NPC made from a creature) goes through `editNpcConditions` below, with
 * the same ownership check (in practice the GM, since a monster is `none` to
 * players). The merge and clearing rules themselves are
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
import { actorSchema, combatantSchema } from '@hearthtable/core';
import type { AppliedCondition, ConditionDuration } from '@hearthtable/pf2e';
import {
  addCondition,
  conditionDurationSchema,
  npcDataSchema,
  removeCondition,
  setCondition,
} from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

interface ConditionPayload {
  actorId: string;
  slug: string;
  value?: number | undefined;
  duration?: Record<string, unknown> | undefined;
}

/**
 * The payload's duration, checked: it must be a duration the game system knows,
 * and a turn-anchored one must name a combatant that exists (a missing one would
 * never expire it).
 */
function durationOf(
  store: WorldStore,
  payload: ConditionPayload,
): ConditionDuration | undefined {
  if (payload.duration === undefined) {
    return undefined;
  }
  const parsed = conditionDurationSchema.safeParse(payload.duration);
  if (!parsed.success) {
    throw new OperationRejected('that is not a valid condition duration');
  }
  if (
    parsed.data.type === 'turn' &&
    combatantSchema.safeParse(store.getDocument(parsed.data.combatantId)).success ===
      false
  ) {
    throw new OperationRejected(`no combatant found with id ${parsed.data.combatantId}`);
  }
  return parsed.data;
}

/** `{ slug, value, duration }` with absent fields left out entirely (`exactOptionalPropertyTypes`). */
function applied(
  store: WorldStore,
  payload: ConditionPayload,
): { slug: string; value?: number; duration?: ConditionDuration } {
  const duration = durationOf(store, payload);
  return {
    slug: payload.slug,
    ...(payload.value === undefined ? {} : { value: payload.value }),
    ...(duration === undefined ? {} : { duration }),
  };
}

function requireKnown(compendium: CompendiumIndex, slug: string): void {
  const definitions = compendium.conditions();
  if (definitions.size > 0 && !definitions.has(slug)) {
    throw new OperationRejected(`unknown condition: ${slug}`);
  }
}

/** Replaces a monster's `conditions` with `edit` of them, after the same ownership check a character gets. */
function editNpcConditions(
  store: WorldStore,
  actor: Actor,
  edit: (conditions: readonly AppliedCondition[]) => AppliedCondition[],
): Actor {
  const data = npcDataSchema.safeParse(actor.system);
  if (!data.success) {
    throw new OperationRejected(`${actor.name} has no creature stats`);
  }
  const updated: Actor = {
    ...actor,
    system: { ...data.data, conditions: edit(data.data.conditions) },
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);
  return updated;
}

/** Applies `edit` to the conditions of a character or a monster; any other kind of actor is rejected. */
function editConditions(
  store: WorldStore,
  seat: Seat,
  actorId: string,
  edit: (conditions: readonly AppliedCondition[]) => AppliedCondition[],
): Actor {
  const { raw } = loadOwnedDocument(store, seat, actorId, 'actor', 'actor');
  const actor = actorSchema.parse(raw);
  if (actor.kind === 'npc') {
    return editNpcConditions(store, actor, edit);
  }
  return editCharacter(store, seat, actorId, (data) => ({
    ...data,
    conditions: edit(data.conditions),
  }));
}

/** Adds a condition, keeping the higher value if the character already has it and clearing what it supersedes. */
export function addConditionToActor(
  store: WorldStore,
  seat: Seat,
  compendium: CompendiumIndex,
  payload: ConditionPayload,
): Actor {
  requireKnown(compendium, payload.slug);
  return editConditions(store, seat, payload.actorId, (conditions) =>
    addCondition(conditions, applied(store, payload), compendium.conditions()),
  );
}

/** Sets a condition to exactly `payload.value` (0 removes it): the manual override. */
export function setConditionOnActor(
  store: WorldStore,
  seat: Seat,
  compendium: CompendiumIndex,
  payload: ConditionPayload,
): Actor {
  requireKnown(compendium, payload.slug);
  return editConditions(store, seat, payload.actorId, (conditions) =>
    setCondition(conditions, applied(store, payload), compendium.conditions()),
  );
}

/** Removes a condition. Removing one the character does not have is not an error: the sheet is already as asked. */
export function removeConditionFromActor(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string; slug: string },
): Actor {
  return editConditions(store, seat, payload.actorId, (conditions) =>
    removeCondition(conditions, payload.slug),
  );
}
