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
import { computed, ref, watch } from 'vue';

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

  return { activeCombat, order, activeCombatant, activeIsUnseen, error, load };
});
