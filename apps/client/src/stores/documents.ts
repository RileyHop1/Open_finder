/**
 * The actors and party of the currently active campaign: loaded once over REST
 * (`api/documents.ts`), then kept live by watching `connectionStore`'s
 * `lastBroadcast`, the same way `stores/chat.ts` does for messages.
 *
 * **Server-confirmed state plus pending edits.** What the store holds as
 * `confirmedActors` is only ever what the server has said. An edit the user
 * makes (`updateActor`) is recorded as a pending change set keyed by its
 * operation id, and the actors the UI reads (`actors`) are the confirmed ones
 * with the pending changes applied on top. That makes the ADR 0005 rules fall
 * out of the data rather than out of bookkeeping: the edit shows instantly; the
 * broadcast that confirms it replaces the pending entry (the server's document
 * already contains it); a rejection just drops the pending entry, so the
 * display rolls back to the last server-confirmed state with nothing to undo
 * by hand.
 *
 * Only `actor.update` is optimistic. Operations whose result depends on server
 * logic (adding an item copies from the compendium; a condition merges) go
 * through `send` and show up when the broadcast arrives.
 */

import type { Actor, Broadcast, Party } from '@hearthtable/core';
import { actorSchema, applyChanges, partySchema, PatchError } from '@hearthtable/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { getParty, listActors } from '../api/documents.js';
import { useConnectionStore } from './connection.js';

interface PendingUpdate {
  readonly operationId: string;
  readonly actorId: string;
  readonly changes: Readonly<Record<string, unknown>>;
}

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

/** `actor` with the pending `updates` for it applied in order. A change that cannot be applied (the server would reject it too) is skipped. */
function withPending(actor: Actor, updates: readonly PendingUpdate[]): Actor {
  const mine = updates.filter((update) => update.actorId === actor.id);
  if (mine.length === 0) {
    return actor;
  }
  // A JSON round trip, not structuredClone: documents are plain JSON, and reactive proxies (which can be nested anywhere in a stored actor) cannot be structured-cloned.
  const draft = JSON.parse(JSON.stringify(actor)) as Record<string, unknown>;
  for (const update of mine) {
    try {
      applyChanges(draft, update.changes);
    } catch (caught) {
      if (!(caught instanceof PatchError)) {
        throw caught;
      }
    }
  }
  return draft as Actor;
}

export const useDocumentsStore = defineStore('documents', () => {
  const connection = useConnectionStore();
  const confirmedActors = ref<Actor[]>([]);
  const party = ref<Party>();
  const pending = ref<PendingUpdate[]>([]);
  const error = ref<string>();
  let worldId: string | undefined;

  /** Actors as the UI should show them: server-confirmed, plus this client's unconfirmed edits. */
  const actors = computed(() =>
    confirmedActors.value.map((actor) => withPending(actor, pending.value)),
  );

  /** The party's members, in party order, skipping any id this seat cannot see. */
  const members = computed(() => {
    const byId = new Map(actors.value.map((actor) => [actor.id, actor]));
    return (party.value?.memberIds ?? []).flatMap((id) => {
      const actor = byId.get(id);
      return actor === undefined ? [] : [actor];
    });
  });

  function actorById(id: string): Actor | undefined {
    return actors.value.find((actor) => actor.id === id);
  }

  /** Loads the world's actors and party. Call when the table for this world mounts; it runs again after a reconnect, so a missed broadcast cannot leave the view stale. */
  async function load(forWorldId: string): Promise<void> {
    worldId = forWorldId;
    try {
      const [loadedActors, loadedParty] = await Promise.all([
        listActors(forWorldId),
        getParty(forWorldId),
      ]);
      confirmedActors.value = loadedActors;
      party.value = loadedParty;
      error.value = undefined;
    } catch (caught) {
      error.value = messageOf(caught, 'failed to load characters');
    }
  }

  function applyBroadcast(broadcast: Broadcast): void {
    const operationId = broadcast.operation.id;
    // A confirmed edit is now inside the server's document; drop its overlay in
    // the same update that replaces the document, so it never shows twice.
    pending.value = pending.value.filter((update) => update.operationId !== operationId);

    for (const tombstone of broadcast.deleted) {
      confirmedActors.value = confirmedActors.value.filter(
        (actor) => actor.id !== tombstone.id,
      );
      pending.value = pending.value.filter((update) => update.actorId !== tombstone.id);
      if (party.value?.id === tombstone.id) {
        party.value = undefined;
      }
    }

    for (const document of broadcast.documents) {
      const actor = actorSchema.safeParse(document);
      if (actor.success) {
        const index = confirmedActors.value.findIndex((a) => a.id === actor.data.id);
        confirmedActors.value =
          index === -1
            ? [...confirmedActors.value, actor.data]
            : confirmedActors.value.map((a, i) => (i === index ? actor.data : a));
        continue;
      }
      const updatedParty = partySchema.safeParse(document);
      if (updatedParty.success) {
        party.value = updatedParty.data;
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

  /** Sends an operation and records a rejection in `error`. Returns whether it was accepted. */
  async function send(type: string, payload: unknown): Promise<boolean> {
    error.value = undefined;
    const ack = await connection.sendOperation(crypto.randomUUID(), type, payload);
    if (!ack.ok) {
      error.value = ack.error ?? `${type} failed`;
    }
    return ack.ok;
  }

  /**
   * Changes fields of an actor, shown immediately and rolled back if the server
   * rejects it. `changes` maps dotted paths to values (`docs/operations.md`,
   * "`actor.update` paths").
   */
  async function updateActor(
    actorId: string,
    changes: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const operationId = crypto.randomUUID();
    error.value = undefined;
    pending.value = [...pending.value, { operationId, actorId, changes }];
    const ack = await connection.sendOperation(operationId, 'actor.update', {
      actorId,
      changes,
    });
    if (!ack.ok) {
      pending.value = pending.value.filter(
        (update) => update.operationId !== operationId,
      );
      error.value = ack.error ?? 'failed to update the character';
    }
    return ack.ok;
  }

  return { actors, members, party, error, actorById, load, send, updateActor };
});
