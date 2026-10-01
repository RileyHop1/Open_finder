/**
 * The scenes and tokens of the active campaign, and which scene is on screen.
 * Loaded once over REST (`api/documents.ts`), then kept live by watching
 * `connectionStore`'s `lastBroadcast`, the way `stores/documents.ts` keeps
 * actors.
 *
 * **Which scene is showing.** The party follows one scene (ADR 0017): the GM
 * moves it with `scene.activate`, which writes `party.sceneId`, and everyone's
 * screen follows. `shownSceneId` is that, unless this GM is *previewing*
 * another scene, which is purely local: it changes only what this browser
 * shows, never what the players see. A player is never offered a scene the
 * server did not send them, so for them the shown scene is always the party's.
 *
 * **Server-confirmed state plus pending moves.** As with actor edits, the
 * store holds only what the server has said (`confirmedTokens`), and a move
 * the user makes is a pending entry laid on top of it. The broadcast that
 * confirms the move replaces the pending entry (the server's token already has
 * the new position); a rejection just drops it, so the token snaps back to the
 * last confirmed position with nothing to undo by hand.
 *
 * **This seat's own drag.** While the user holds a token, `setLocalDrag` puts
 * it where the pointer is, above everything else, so it follows the hand even
 * if an earlier move is still unconfirmed; `clearLocalDrag` lets go (after the
 * move is sent, which takes over as a pending move).
 *
 * **Drag previews.** Another seat's mid-drag position arrives as a `token.drag`
 * event, not an operation (ADR 0005, decision 6). It is shown instead of the
 * token's settled position, and goes away when the settled token arrives, or
 * on its own after `DRAG_PREVIEW_TTL_MS` of silence, so a player who loses
 * their connection mid-drag cannot leave a ghost behind.
 */

import type { Broadcast, Scene, Token } from '@hearthtable/core';
import { sceneSchema, tokenSchema } from '@hearthtable/core';
import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, watch } from 'vue';

import { listScenes, listTokens } from '../api/documents.js';
import { useConnectionStore } from './connection.js';
import { useDocumentsStore } from './documents.js';

/** How long a drag preview stays without a newer one before it is dropped. */
export const DRAG_PREVIEW_TTL_MS = 2000;

interface PendingMove {
  readonly operationId: string;
  readonly tokenId: string;
  readonly x: number;
  readonly y: number;
}

export const useScenesStore = defineStore('scenes', () => {
  const connection = useConnectionStore();
  const documents = useDocumentsStore();

  const confirmedScenes = ref<Scene[]>([]);
  const confirmedTokens = ref<Token[]>([]);
  const pendingMoves = ref<PendingMove[]>([]);
  const drags = ref<Record<string, { x: number; y: number }>>({});
  const localDrags = ref<Record<string, { x: number; y: number }>>({});
  const previewSceneId = ref<string>();
  const error = ref<string>();
  const dragTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let worldId: string | undefined;

  const scenes = computed(() => confirmedScenes.value);

  /** The scene the party is on, or undefined if the GM has not moved it anywhere yet. */
  const partySceneId = computed(() => documents.party?.sceneId);

  /** What this browser shows: the GM's local preview if there is one (and it still exists), else the party's scene. */
  const shownSceneId = computed(() => {
    const preview = previewSceneId.value;
    if (preview !== undefined && confirmedScenes.value.some((s) => s.id === preview)) {
      return preview;
    }
    return partySceneId.value;
  });

  const shownScene = computed(() =>
    confirmedScenes.value.find((scene) => scene.id === shownSceneId.value),
  );

  /** True while this browser shows a scene other than the party's, so the UI can say so. */
  const isPreviewing = computed(
    () => shownSceneId.value !== undefined && shownSceneId.value !== partySceneId.value,
  );

  /** Tokens as the UI should show them: confirmed, with this client's own drag, else its unconfirmed moves, else another seat's live drag, in place of the settled position. */
  const tokens = computed(() =>
    confirmedTokens.value.map((token) => {
      const held = localDrags.value[token.id];
      if (held !== undefined) {
        return { ...token, x: held.x, y: held.y };
      }
      const moves = pendingMoves.value.filter((move) => move.tokenId === token.id);
      const last = moves[moves.length - 1];
      if (last !== undefined) {
        return { ...token, x: last.x, y: last.y };
      }
      const drag = drags.value[token.id];
      return drag === undefined ? token : { ...token, x: drag.x, y: drag.y };
    }),
  );

  const shownTokens = computed(() =>
    tokens.value.filter((token) => token.sceneId === shownSceneId.value),
  );

  function forgetDrag(tokenId: string): void {
    const timer = dragTimers.get(tokenId);
    if (timer !== undefined) {
      clearTimeout(timer);
      dragTimers.delete(tokenId);
    }
    if (tokenId in drags.value) {
      const { [tokenId]: _gone, ...rest } = drags.value;
      drags.value = rest;
    }
  }

  function forgetAllDrags(): void {
    for (const tokenId of [...dragTimers.keys()]) {
      forgetDrag(tokenId);
    }
    drags.value = {};
  }

  /** Loads the world's scenes and tokens. Runs again after a reconnect, so a missed broadcast cannot leave the map stale. */
  async function load(forWorldId: string): Promise<void> {
    worldId = forWorldId;
    try {
      const [loadedScenes, loadedTokens] = await Promise.all([
        listScenes(forWorldId),
        listTokens(forWorldId),
      ]);
      confirmedScenes.value = loadedScenes;
      confirmedTokens.value = loadedTokens;
      forgetAllDrags();
      error.value = undefined;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'failed to load scenes';
    }
  }

  function applyBroadcast(broadcast: Broadcast): void {
    const operationId = broadcast.operation.id;
    pendingMoves.value = pendingMoves.value.filter(
      (move) => move.operationId !== operationId,
    );

    for (const tombstone of broadcast.deleted) {
      confirmedScenes.value = confirmedScenes.value.filter((s) => s.id !== tombstone.id);
      confirmedTokens.value = confirmedTokens.value.filter((t) => t.id !== tombstone.id);
      pendingMoves.value = pendingMoves.value.filter(
        (move) => move.tokenId !== tombstone.id,
      );
      forgetDrag(tombstone.id);
    }

    for (const document of broadcast.documents) {
      if (document.type === 'scene') {
        const scene = sceneSchema.safeParse(document);
        if (scene.success) {
          const index = confirmedScenes.value.findIndex((s) => s.id === scene.data.id);
          confirmedScenes.value =
            index === -1
              ? [...confirmedScenes.value, scene.data]
              : confirmedScenes.value.map((s, i) => (i === index ? scene.data : s));
        }
      } else if (document.type === 'token') {
        const token = tokenSchema.safeParse(document);
        if (token.success) {
          const index = confirmedTokens.value.findIndex((t) => t.id === token.data.id);
          confirmedTokens.value =
            index === -1
              ? [...confirmedTokens.value, token.data]
              : confirmedTokens.value.map((t, i) => (i === index ? token.data : t));
          // The settled token is the truth now; a preview of it is stale.
          forgetDrag(token.data.id);
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

  const stopListening = connection.onTokenDrag((drag) => {
    // A preview of a token this seat cannot see is dropped by the server, but
    // one that arrives for an unknown token (deleted a moment ago) is ignored.
    if (!confirmedTokens.value.some((token) => token.id === drag.tokenId)) {
      return;
    }
    drags.value = { ...drags.value, [drag.tokenId]: { x: drag.x, y: drag.y } };
    const previous = dragTimers.get(drag.tokenId);
    if (previous !== undefined) {
      clearTimeout(previous);
    }
    dragTimers.set(
      drag.tokenId,
      setTimeout(() => forgetDrag(drag.tokenId), DRAG_PREVIEW_TTL_MS),
    );
  });
  onScopeDispose(() => {
    stopListening();
    forgetAllDrags();
  });

  /** Shows `sceneId` on this browser only (the GM's preview), or the party's scene again when `undefined`. */
  function previewScene(sceneId: string | undefined): void {
    previewSceneId.value = sceneId;
  }

  /**
   * Moves a token to `x`, `y` (scene pixels, the token's centre), shown at once
   * and rolled back if the server refuses. Returns whether it was accepted.
   */
  async function moveToken(tokenId: string, x: number, y: number): Promise<boolean> {
    const operationId = crypto.randomUUID();
    error.value = undefined;
    pendingMoves.value = [...pendingMoves.value, { operationId, tokenId, x, y }];
    const ack = await connection.sendOperation(operationId, 'token.move', {
      tokenId,
      x,
      y,
    });
    if (!ack.ok) {
      pendingMoves.value = pendingMoves.value.filter(
        (move) => move.operationId !== operationId,
      );
      error.value = ack.error ?? 'failed to move the token';
    }
    return ack.ok;
  }

  /** Sends an operation that is not optimistic (the server decides the result) and records a rejection in `error`. Returns whether it was accepted. */
  async function send(type: string, payload: unknown): Promise<boolean> {
    error.value = undefined;
    const ack = await connection.sendOperation(crypto.randomUUID(), type, payload);
    if (!ack.ok) {
      error.value = ack.error ?? `${type} failed`;
    }
    return ack.ok;
  }

  /** Shows `tokenId` at `x`, `y` while this seat holds it. Nothing is sent: see `sendDrag`. */
  function setLocalDrag(tokenId: string, x: number, y: number): void {
    localDrags.value = { ...localDrags.value, [tokenId]: { x, y } };
  }

  /** Lets go of `tokenId`: it shows where it is confirmed or pending again. */
  function clearLocalDrag(tokenId: string): void {
    if (tokenId in localDrags.value) {
      const { [tokenId]: _gone, ...rest } = localDrags.value;
      localDrags.value = rest;
    }
  }

  /** Tells the others where `tokenId` is mid-drag. The caller throttles; this only sends. */
  function sendDrag(tokenId: string, x: number, y: number): void {
    connection.sendTokenDrag({ tokenId, x, y });
  }

  return {
    scenes,
    tokens,
    partySceneId,
    shownSceneId,
    shownScene,
    shownTokens,
    isPreviewing,
    error,
    load,
    previewScene,
    moveToken,
    send,
    sendDrag,
    setLocalDrag,
    clearLocalDrag,
  };
});
