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
 * creates exactly one and shares it across its HTTP routes and its Socket.IO
 * handlers, which is what actually makes it a singleton in practice for one
 * running process.
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
  /**
   * Registers `listener` to be called whenever the active world changes --
   * on a successful `set()` and on `clear()`, but not on a `set()` that
   * throws (the active world didn't actually change). Only one listener at
   * a time; a second call replaces the first. That's sufficient for the one
   * real consumer this has (the realtime layer, which disconnects all
   * sockets so they reconnect against the new world's context rather than
   * silently keep receiving a stale world's broadcasts) -- if a second
   * consumer ever needs this too, that's the moment to generalize to
   * multiple listeners, not before.
   *
   * A setter rather than a constructor parameter on purpose: the listener
   * this is for needs a reference to the Socket.IO server, which doesn't
   * exist until *after* this manager is constructed and handed to
   * `attachRealtime` -- see `realtime.ts`.
   */
  onChange(listener: () => void): void;
}

export function createActiveWorldManager(): ActiveWorldManager {
  let current: WorldStore | undefined;
  let listener: (() => void) | undefined;

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
      listener?.();
      return current;
    },

    clear(): void {
      current?.close();
      current = undefined;
      listener?.();
    },

    onChange(next: () => void): void {
      listener = next;
    },
  };
}
