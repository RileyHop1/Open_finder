/**
 * The combat on the shown scene and its combatants, kept live the way
 * `stores/scenes.ts` keeps tokens: loaded once over REST, then updated from
 * `connectionStore`'s broadcasts, and reloaded after a reconnect.
 *
 * **What a seat can read is what it gets.** A pending combat and a hidden
 * combatant are never sent to a player (`docs/combat.md`), so `order` is the
 * turn order of what this seat may see, and a hidden creature acting is
 * `activeIsUnseen`: the active combatant's id is on the combat but not in `order`.
 *
 * **The order is not re-derived here.** `sortByInitiative` is the same function
 * the server steps turns with, so the bar and the table agree on a tie.
 */

import type { Broadcast, Combat, Combatant } from '@hearthtable/core';
import { actorSchema, combatantSchema, combatSchema } from '@hearthtable/core';
import { sortByInitiative } from '@hearthtable/pf2e';
import { defineStore } from 'pinia';
import { computed, nextTick, ref, watch } from 'vue';

import { listCombatants, listCombats } from '../api/documents.js';
import { useConnectionStore } from './connection.js';
import { useDocumentsStore } from './documents.js';
import { useScenesStore } from './scenes.js';

function upsert<T extends { id: string }>(list: readonly T[], item: T): T[] {
  return list.some((existing) => existing.id === item.id)
    ? list.map((existing) => (existing.id === item.id ? item : existing))
    : [...list, item];
}

export const useCombatStore = defineStore('combat', () => {
  const connection = useConnectionStore();
  const documents = useDocumentsStore();
  const scenes = useScenesStore();

  const combats = ref<Combat[]>([]);
  const combatants = ref<Combatant[]>([]);
  const error = ref<string>();
  let worldId: string | undefined;

  /** The unfinished combat on the scene this browser shows, if this seat can read one. */
  const activeCombat = computed(() =>
    combats.value.find(
      (combat) => combat.status !== 'ended' && combat.sceneId === scenes.shownSceneId,
    ),
  );

  /** This combat's combatants this seat can read, in turn order (defeated ones last). */
  const order = computed<Combatant[]>(() => {
    const combat = activeCombat.value;
    if (combat === undefined) {
      return [];
    }
    const mine = combatants.value.filter((c) => c.combatId === combat.id);
    const byId = new Map(mine.map((c) => [c.id, c]));
    return sortByInitiative(
      mine.map((c) => ({
        id: c.id,
        initiative: c.initiative,
        defeated: c.defeated,
        isCharacter:
          actorSchema.safeParse(documents.actorById(c.actorId)).data?.kind ===
          'character',
        createdAt: c.createdAt,
      })),
    ).flatMap((entry) => {
      const found = byId.get(entry.id);
      return found === undefined ? [] : [found];
    });
  });

  /** This combat's combatant for `tokenId`, or undefined if it has not joined. */
  function combatantByToken(tokenId: string): Combatant | undefined {
    const combatId = activeCombat.value?.id;
    return combatId === undefined
      ? undefined
      : combatants.value.find((c) => c.combatId === combatId && c.tokenId === tokenId);
  }

  /** Whose turn it is, when this seat can read that combatant. */
  const activeCombatant = computed(() =>
    order.value.find((c) => c.id === activeCombat.value?.activeCombatantId),
  );

  /** Someone is acting whom this seat cannot see (a hidden creature). */
  const activeIsUnseen = computed(
    () =>
      activeCombat.value?.status === 'active' &&
      activeCombat.value.activeCombatantId !== undefined &&
      activeCombatant.value === undefined,
  );

  async function load(forWorldId: string): Promise<void> {
    worldId = forWorldId;
    try {
      const [loadedCombats, loadedCombatants] = await Promise.all([
        listCombats(forWorldId),
        listCombatants(forWorldId),
      ]);
      combats.value = loadedCombats;
      combatants.value = loadedCombatants;
      error.value = undefined;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'failed to load combat';
    }
  }

  function applyBroadcast(broadcast: Broadcast): void {
    for (const tombstone of broadcast.deleted) {
      combats.value = combats.value.filter((c) => c.id !== tombstone.id);
      combatants.value = combatants.value.filter((c) => c.id !== tombstone.id);
    }
    for (const document of broadcast.documents) {
      if (document.type === 'combat') {
        const combat = combatSchema.safeParse(document);
        if (combat.success) {
          combats.value = upsert(combats.value, combat.data);
        }
      } else if (document.type === 'combatant') {
        const combatant = combatantSchema.safeParse(document);
        if (combatant.success) {
          combatants.value = upsert(combatants.value, combatant.data);
        }
      }
    }
  }

  watch(
    () => connection.lastBroadcast,
    (broadcast) => {
      if (broadcast !== undefined) {
        applyBroadcast(broadcast);
      }
    },
  );

  watch(
    () => connection.status,
    (status, previous) => {
      if (status === 'connected' && previous !== undefined && worldId !== undefined) {
        void load(worldId);
      }
    },
  );

  /** Sends an operation that is not optimistic (the server decides) and records a rejection in `error`. Returns whether it was accepted. */
  async function send(type: string, payload: unknown): Promise<boolean> {
    error.value = undefined;
    const ack = await connection.sendOperation(crypto.randomUUID(), type, payload);
    if (!ack.ok) {
      error.value = ack.error ?? `${type} failed`;
    }
    return ack.ok;
  }

  /**
   * Sets up and starts a combat on the shown scene: GM only (the server checks).
   * Creates one first if the scene has none unfinished -- CLAUDE.md's rule that
   * nothing else may start a combat, so this is the one path onto the wire.
   *
   * The ack for `combat.create` carries no document (`OperationAck` is just
   * `{ok, error?}`): the new combat's id comes from the broadcast that
   * `applyBroadcast` turns into `activeCombat`. `nextTick` waits for that
   * watcher to run before this reads it, rather than trusting that the
   * broadcast and the ack happen to arrive in a useful order.
   */
  async function startCombat(): Promise<boolean> {
    const sceneId = scenes.shownSceneId;
    if (sceneId === undefined) {
      return false;
    }
    let combatId = activeCombat.value?.id;
    if (combatId === undefined) {
      error.value = undefined;
      const ack = await connection.sendOperation(crypto.randomUUID(), 'combat.create', {
        sceneId,
      });
      if (!ack.ok) {
        error.value = ack.error ?? 'combat.create failed';
        return false;
      }
      await nextTick();
      combatId = activeCombat.value?.id;
    }
    return combatId === undefined ? false : send('combat.start', { combatId });
  }

  /** Ends the active combat. No-op (false) if there isn't one. */
  function endCombat(): Promise<boolean> {
    const combatId = activeCombat.value?.id;
    return combatId === undefined
      ? Promise.resolve(false)
      : send('combat.end', { combatId });
  }

  /** Advances to the next turn. No-op (false) if there is no active combat. */
  function nextTurn(): Promise<boolean> {
    const combatId = activeCombat.value?.id;
    return combatId === undefined
      ? Promise.resolve(false)
      : send('combat.nextTurn', { combatId });
  }

  /** Steps back to the previous turn. No-op (false) if there is no active combat. */
  function previousTurn(): Promise<boolean> {
    const combatId = activeCombat.value?.id;
    return combatId === undefined
      ? Promise.resolve(false)
      : send('combat.previousTurn', { combatId });
  }

  /**
   * Joins `tokenId` to the active combat (the GM's "Add to combat"), `hidden` as
   * the token already is. The server rolls its initiative at once if the combat
   * is active. No-op (false) if there is no active combat.
   */
  function addCombatant(tokenId: string, hidden: boolean): Promise<boolean> {
    const combatId = activeCombat.value?.id;
    return combatId === undefined
      ? Promise.resolve(false)
      : send('combat.addCombatant', { combatId, tokenId, hidden });
  }

  /** Sets a combatant's initiative directly: the GM's override. */
  function setInitiative(combatantId: string, initiative: number): Promise<boolean> {
    return send('combat.setInitiative', { combatantId, initiative });
  }

  /** Switches free movement for the whole combat on or off. No-op (false) with no active combat. */
  function setFreeMovement(on: boolean): Promise<boolean> {
    const combatId = activeCombat.value?.id;
    return combatId === undefined
      ? Promise.resolve(false)
      : send('combat.setMovementRuling', { combatId, freeMovement: on });
  }

  /** Grants, or revokes, one combatant's out-of-turn move. No-op (false) with no active combat. */
  function setMovementGrant(combatantId: string, allowed: boolean): Promise<boolean> {
    const combatId = activeCombat.value?.id;
    return combatId === undefined
      ? Promise.resolve(false)
      : send('combat.setMovementRuling', { combatId, grant: { combatantId, allowed } });
  }

  /**
   * Adds (or, negative, gives back) actions spent on `combatantId`'s turn. The
   * server never refuses an overspend (docs/action-economy.md): it is warned
   * about in the tray, not blocked here.
   */
  function spendAction(combatantId: string, actions: number): Promise<boolean> {
    return send('combat.spendAction', { combatantId, actions });
  }

  /** Sets whether `combatantId`'s reaction is used this turn. */
  function setReaction(combatantId: string, used: boolean): Promise<boolean> {
    return send('combat.spendAction', { combatantId, reaction: used });
  }

  return {
    activeCombat,
    order,
    combatantByToken,
    activeCombatant,
    activeIsUnseen,
    error,
    load,
    startCombat,
    endCombat,
    nextTurn,
    previousTurn,
    addCombatant,
    setInitiative,
    setFreeMovement,
    setMovementGrant,
    spendAction,
    setReaction,
  };
});
