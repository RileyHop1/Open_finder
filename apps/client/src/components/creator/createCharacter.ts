/**
 * Turns a finished draft into a character on the server, in the steps the
 * operations need (`docs/character-build.md`, "Creating the character"):
 *
 * 1. `actor.create` makes a blank character with the name.
 * 2. We wait for it to arrive, because the server picks its id.
 * 3. `actor.applyBuild` sends the build; the server derives every number from
 *    its own compendium.
 * 4. `actor.addItem` for each piece of equipment bought.
 * 5. `actor.adjustCoins` gives the change.
 *
 * The client never sends a stat or an item body, only choices and the names of
 * compendium entries. If a later step is refused the character still exists:
 * the result says which step failed, so the player can finish on the sheet
 * (the work already done is not undone).
 */

import type { Actor } from '@hearthtable/core';
import type { Attribute, CharacterBuild } from '@hearthtable/pf2e';
import { watch } from 'vue';

import { type EquipmentLine, changeAfter } from './equipmentPlan.js';

export interface CreationInput {
  readonly name: string;
  readonly build: CharacterBuild;
  readonly keyAttribute: Attribute | undefined;
  readonly equipment: readonly EquipmentLine[];
}

export interface CreationDeps {
  /** Sends an operation; resolves to whether the server accepted it. */
  readonly send: (type: string, payload: unknown) => Promise<boolean>;
  /** Resolves to the character that arrives after the one called with `known`, or `undefined` if none does in time. */
  readonly waitForNewActor: (known: ReadonlySet<string>) => Promise<string | undefined>;
  /** The ids of the actors already in the world. */
  readonly knownActorIds: () => ReadonlySet<string>;
  /** The server's last rejection message, if it gave one. */
  readonly lastError: () => string | undefined;
}

export type CreationResult =
  | { readonly ok: true; readonly actorId: string }
  | {
      readonly ok: false;
      /** The character if it was made before the failure. */
      readonly actorId: string | undefined;
      readonly step: 'create' | 'arrive' | 'build' | 'equipment' | 'coins';
      readonly message: string;
    };

const NAME_FALLBACK = 'New character';

/** Creates the character from `input`, stopping at the first refused step. */
export async function createCharacterFromDraft(
  input: CreationInput,
  deps: CreationDeps,
): Promise<CreationResult> {
  const fail = (
    actorId: string | undefined,
    step: Extract<CreationResult, { ok: false }>['step'],
    fallback: string,
  ): CreationResult => ({
    ok: false,
    actorId,
    step,
    message: deps.lastError() ?? fallback,
  });

  const known = new Set(deps.knownActorIds());
  const name = input.name.trim() === '' ? NAME_FALLBACK : input.name.trim();
  if (!(await deps.send('actor.create', { kind: 'character', name }))) {
    return fail(undefined, 'create', 'the server did not create the character');
  }
  const actorId = await deps.waitForNewActor(known);
  if (actorId === undefined) {
    return fail(undefined, 'arrive', 'the new character never arrived');
  }

  const applied = await deps.send('actor.applyBuild', {
    actorId,
    build: input.build,
    ...(input.keyAttribute === undefined ? {} : { keyAttribute: input.keyAttribute }),
  });
  if (!applied) {
    return fail(actorId, 'build', 'the server did not apply the build');
  }

  for (const line of input.equipment) {
    const added = await deps.send('actor.addItem', {
      actorId,
      packId: line.packId,
      slug: line.slug,
      quantity: line.quantity,
    });
    if (!added) {
      return fail(actorId, 'equipment', `the server did not add ${line.name}`);
    }
  }

  const change = changeAfter(input.equipment);
  if (change.gp + change.sp + change.cp > 0) {
    const paid = await deps.send('actor.adjustCoins', {
      actorId,
      delta: { gp: change.gp, sp: change.sp, cp: change.cp },
    });
    if (!paid) {
      return fail(actorId, 'coins', 'the server did not give the change');
    }
  }
  return { ok: true, actorId };
}

/**
 * A `waitForNewActor` over a reactive list of actors: resolves when an actor
 * whose id is not in `known` appears (checking at once, as it may already have
 * arrived), or to `undefined` after `timeoutMs`.
 */
export function newActorWaiter(
  actors: () => readonly Pick<Actor, 'id'>[],
  timeoutMs = 10_000,
): (known: ReadonlySet<string>) => Promise<string | undefined> {
  return (known) =>
    new Promise((resolve) => {
      const find = () => actors().find((a) => !known.has(a.id))?.id;
      const now = find();
      if (now !== undefined) {
        resolve(now);
        return;
      }
      const stop = watch(
        () => find(),
        (id) => {
          if (id !== undefined) {
            clearTimeout(timer);
            stop();
            resolve(id);
          }
        },
      );
      const timer = setTimeout(() => {
        stop();
        resolve(undefined);
      }, timeoutMs);
    });
}
