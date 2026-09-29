import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ActiveWorldManager, createActiveWorldManager } from './activeWorld.js';
import { createWorld } from './worldStore.js';

let worldsRoot: string;
let manager: ActiveWorldManager;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-activeworld-test-'));
  manager = createActiveWorldManager();
});

afterEach(() => {
  // Close whatever the test left active BEFORE removing its directory --
  // on Windows, an open SQLite handle inside worldsRoot makes rmSync fail
  // with EPERM, since the directory can't be deleted while something still
  // has a file inside it open.
  manager.clear();
  rmSync(worldsRoot, { recursive: true, force: true });
});

describe('createActiveWorldManager', () => {
  it('has no active world initially', () => {
    expect(manager.get()).toBeUndefined();
  });

  it('set() opens and returns the requested world', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();

    const active = manager.set(worldsRoot, created.world.id);
    expect(active.world.id).toBe(created.world.id);
    expect(manager.get()).toBe(active);
  });

  it('set() closes the previously active world before opening the new one', () => {
    const a = createWorld(worldsRoot, 'World A');
    a.close();
    const b = createWorld(worldsRoot, 'World B');
    b.close();

    const activeA = manager.set(worldsRoot, a.world.id);
    manager.set(worldsRoot, b.world.id);

    // activeA's underlying connection should now be closed.
    expect(() => activeA.getMeta('anything')).toThrow();
  });

  it('leaves the previous world open and usable if activating a bad id fails', () => {
    // This pins the fix for a real ordering bug: closing the old world
    // before confirming the new one opens would leave a failed activate
    // silently returning a reference to an already-closed store.
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();

    const active = manager.set(worldsRoot, created.world.id);

    expect(() => manager.set(worldsRoot, crypto.randomUUID())).toThrow();
    expect(manager.get()).toBe(active);
    expect(() => active.getMeta('anything')).not.toThrow();
  });

  it('clear() closes the active world and resets to undefined', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();

    const active = manager.set(worldsRoot, created.world.id);
    manager.clear();

    expect(manager.get()).toBeUndefined();
    expect(() => active.getMeta('anything')).toThrow();
  });

  it('clear() on a manager with no active world does not throw', () => {
    expect(() => manager.clear()).not.toThrow();
  });

  it('two independent managers do not share state', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();

    const other = createActiveWorldManager();
    manager.set(worldsRoot, created.world.id);

    expect(manager.get()).toBeDefined();
    expect(other.get()).toBeUndefined();
    other.clear();
  });
});
