/**
 * Keeps each token's `hpBar` (the percentage a player may see) in step with its
 * monster's hit points. Players never receive an NPC actor (its permissions are
 * `none`), so a token carries the one number they are allowed -- never the stat
 * block, never the maximum.
 *
 * `syncTokenHpBars` runs inside `handleOperation`'s transaction after every
 * operation, so no code path that changes hit points, a token's `showHpBar`, or
 * places a token has to remember it. A bar is filled only while `showHpBar` is on
 * for an NPC's token; otherwise `hpBar` is cleared, so a hidden bar leaves no
 * number behind. A character's token carries none: its owner and the table read
 * the character actor directly.
 */

import type { BaseDocument, Token } from '@hearthtable/core';
import { actorSchema, tokenSchema } from '@hearthtable/core';
import { npcDataSchema, prepareNpc } from '@hearthtable/pf2e';

import type { WorldStore } from './worldStore.js';

/** `current` as a whole percentage of `max`, kept within 0 to 100. A maximum of 0 or less reads as empty. */
export function hpPercent(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((current / max) * 100)));
}

/** The percentage `token` should carry, or `undefined` when it should carry none. */
function desiredPercent(store: WorldStore, token: Token): number | undefined {
  if (!token.showHpBar) {
    return undefined;
  }
  const actor = actorSchema.safeParse(store.getDocument(token.actorId));
  if (!actor.success || actor.data.kind !== 'npc') {
    return undefined;
  }
  const data = npcDataSchema.safeParse(actor.data.system);
  if (!data.success) {
    return undefined;
  }
  return hpPercent(data.data.hp.current, prepareNpc(data.data).hp.max.total);
}

/**
 * Recomputes `hpBar` on every token an operation could have affected: tokens
 * whose NPC actor is in `documents`, and tokens that are themselves in it (a new
 * token, or a `showHpBar` change). Writes the ones that changed and returns
 * `documents` with them added (or replaced), so they are broadcast.
 */
export function syncTokenHpBars(
  store: WorldStore,
  documents: BaseDocument[],
): BaseDocument[] {
  const touchedActors = new Set(
    documents.filter((doc) => doc.type === 'actor').map((doc) => doc.id),
  );
  const touchedTokens = new Set(
    documents.filter((doc) => doc.type === 'token').map((doc) => doc.id),
  );
  if (touchedActors.size === 0 && touchedTokens.size === 0) {
    return documents;
  }

  let result = documents;
  for (const raw of store.listDocuments('token')) {
    const parsed = tokenSchema.safeParse(raw);
    if (
      !parsed.success ||
      !(touchedTokens.has(parsed.data.id) || touchedActors.has(parsed.data.actorId))
    ) {
      continue;
    }
    const token = parsed.data;
    const percent = desiredPercent(store, token);
    if (percent === token.hpBar?.percent) {
      continue;
    }
    const { hpBar: _stale, ...rest } = token;
    const updated: Token = {
      ...rest,
      ...(percent === undefined ? {} : { hpBar: { percent } }),
      updatedAt: new Date().toISOString(),
    };
    store.putDocument(updated);
    result = [...result.filter((doc) => doc.id !== updated.id), updated];
  }
  return result;
}
