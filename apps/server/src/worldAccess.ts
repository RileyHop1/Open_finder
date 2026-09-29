/**
 * Resolves a `WorldStore` for a given world id, reusing the active world's
 * already-open connection when it matches, rather than opening a second one
 * to the same file.
 *
 * A second connection to the same SQLite database is harmless at the
 * SQLite level (WAL mode is largely built for concurrent readers), but it's
 * wasteful, and "single writer per world" is a stated architecture
 * assumption (ADR 0002) worth not casually working around. This is the one
 * place that decision is made, shared by the REST routes (`app.ts`) and,
 * from the next PR, the realtime dispatch pipeline -- both need "give me
 * the store for this world id" and neither should re-decide this on its own.
 */

import type { ActiveWorldManager } from './activeWorld.js';
import type { WorldStore } from './worldStore.js';
import { openWorld } from './worldStore.js';

/**
 * Calls `fn` with the store for `worldId`. Closes it afterward, unless it
 * was the active world's connection, which this function doesn't own and
 * never closes. Propagates `openWorld`'s throw for a nonexistent world id
 * unchanged -- callers already have their own "world not found" handling
 * (see `app.ts`'s 404 responses) and this doesn't duplicate it.
 */
export function withWorldStore<T>(
  activeWorld: ActiveWorldManager,
  worldsRoot: string,
  worldId: string,
  fn: (store: WorldStore) => T,
): T {
  const active = activeWorld.get();
  if (active !== undefined && active.world.id === worldId) {
    return fn(active);
  }

  const store = openWorld(worldsRoot, worldId);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}
