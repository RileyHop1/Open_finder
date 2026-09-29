/**
 * Tracks which world the server is currently serving. Deliberately server
 * runtime state, not a persisted field on any `World` record -- see
 * docs/world-and-seats.md: "which world is active is server runtime state,
 * decided by the GM... not a field stored on any World record." Per the
 * milestone's user story, only one world is active at a time.
 *
 * A factory, not module-level mutable state: each call to
 * `createActiveWorldManager()` gets its own independent closure, so tests
 * never need to reset a shared global between runs. The running server
 * creates exactly one and shares it across its HTTP routes (and, later,
 * Socket.IO handlers), which is what actually makes it a singleton in
 * practice for one running process.
 */

import type { WorldStore } from './worldStore.js';
import { openWorld } from './worldStore.js';

export interface ActiveWorldManager {
  /** The currently active world's store, or undefined if none is active. */
  get(): WorldStore | undefined;
  /**
   * Makes `worldId` the active world: closes whichever world was
   * previously active (if any), opens the new one, and returns its store.
   * Throws if `worldId` doesn't exist -- see `openWorld`.
   */
  set(worldsRoot: string, worldId: string): WorldStore;
  /** Closes the active world's store, if any, and clears it. */
  clear(): void;
}

export function createActiveWorldManager(): ActiveWorldManager {
  let current: WorldStore | undefined;

  return {
    get(): WorldStore | undefined {
      return current;
    },

    set(worldsRoot: string, worldId: string): WorldStore {
      // Open the new world BEFORE closing the old one. If worldId doesn't
      // exist, openWorld throws here and `current` is untouched -- the
      // previously active world stays open and usable. Closing first would
      // mean a failed activate silently leaves `get()` returning a
      // reference to an already-closed store.
      const next = openWorld(worldsRoot, worldId);
      current?.close();
      current = next;
      return current;
    },

    clear(): void {
      current?.close();
      current = undefined;
    },
  };
}
