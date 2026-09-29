import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ActiveWorldManager, createActiveWorldManager } from './activeWorld.js';
import { withWorldStore } from './worldAccess.js';
import { createWorld } from './worldStore.js';

let worldsRoot: string;
let activeWorld: ActiveWorldManager;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-worldaccess-test-'));
  activeWorld = createActiveWorldManager();
});

afterEach(() => {
  activeWorld.clear();
  rmSync(worldsRoot, { recursive: true, force: true });
});

describe('withWorldStore', () => {
  it('reuses the active connection when worldId matches, and does not close it', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();
    const active = activeWorld.set(worldsRoot, created.world.id);

    withWorldStore(activeWorld, worldsRoot, created.world.id, (store) => {
      expect(store).toBe(active);
    });

    // Still usable -- withWorldStore must not have closed it.
    expect(() => active.getMeta('anything')).not.toThrow();
  });

  it('opens and closes a fresh connection when worldId is not the active one', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();
    // No active world at all in this case.

    let storeInsideCallback: ReturnType<typeof createWorld> | undefined;
    withWorldStore(activeWorld, worldsRoot, created.world.id, (store) => {
      storeInsideCallback = store;
    });

    expect(storeInsideCallback).toBeDefined();
    // The connection opened for this call should now be closed.
    expect(() => storeInsideCallback?.getMeta('anything')).toThrow();
  });

  it('opens and closes a fresh connection when a different world is active', () => {
    const other = createWorld(worldsRoot, 'Other World');
    other.close();
    activeWorld.set(worldsRoot, other.world.id);

    const target = createWorld(worldsRoot, 'Target World');
    target.close();

    let usedStoreId: string | undefined;
    withWorldStore(activeWorld, worldsRoot, target.world.id, (store) => {
      usedStoreId = store.world.id;
    });

    expect(usedStoreId).toBe(target.world.id);
    // The active world (the OTHER one) must remain untouched and open.
    expect(() => activeWorld.get()?.getMeta('anything')).not.toThrow();
  });

  it('closes the opened connection even if fn throws', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();

    let storeInsideCallback: ReturnType<typeof createWorld> | undefined;
    expect(() =>
      withWorldStore(activeWorld, worldsRoot, created.world.id, (store) => {
        storeInsideCallback = store;
        throw new Error('simulated failure');
      }),
    ).toThrow('simulated failure');

    expect(() => storeInsideCallback?.getMeta('anything')).toThrow();
  });

  it('propagates the throw for a world id that does not exist', () => {
    expect(() =>
      withWorldStore(activeWorld, worldsRoot, crypto.randomUUID(), () => undefined),
    ).toThrow();
  });

  it("returns fn's return value", () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();

    const result = withWorldStore(activeWorld, worldsRoot, created.world.id, () => 42);
    expect(result).toBe(42);
  });
});
