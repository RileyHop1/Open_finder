import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import type { World } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveWorldPaths } from './paths.js';
import { exportWorldArchive, importWorldArchive } from './worldArchive.js';
import { createWorld, openWorld } from './worldStore.js';

let sourceRoot: string;
let destRoot: string;

beforeEach(() => {
  sourceRoot = mkdtempSync(join(tmpdir(), 'hearthtable-archive-src-'));
  destRoot = mkdtempSync(join(tmpdir(), 'hearthtable-archive-dest-'));
});

afterEach(() => {
  rmSync(sourceRoot, { recursive: true, force: true });
  rmSync(destRoot, { recursive: true, force: true });
});

/** Reads every chunk of `stream` into one buffer -- only test code gets to do this; the module itself never does. */
async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Re-chunks `buffer` into pieces of at most `size` bytes -- deliberately tiny, to prove entry boundaries can fall anywhere across reads, not just where a natural stream happened to split them. */
function tinyChunks(buffer: Buffer, size: number): Buffer[] {
  const pieces: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += size) {
    pieces.push(buffer.subarray(offset, offset + size));
  }
  return pieces;
}

/** Builds one framed entry by hand -- used only to test forward-compatibility and failure cases `exportWorldArchive` itself never produces. */
function buildEntry(name: string, content: Buffer): Buffer {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(4 + nameBytes.length + 8);
  header.writeUInt32LE(nameBytes.length, 0);
  nameBytes.copy(header, 4);
  header.writeBigUInt64LE(BigInt(content.length), 4 + nameBytes.length);
  return Buffer.concat([header, content]);
}

/**
 * Creates a real world (a real `node:sqlite` database, not a fake buffer)
 * with one seat and one document, closes it, and hands back both its
 * manifest and its serialized bytes -- everything `exportWorldArchive`
 * needs, without leaving an open database handle behind for `afterEach`'s
 * `rmSync` to trip over (Windows refuses to delete a file a process still
 * has open).
 */
function buildFixtureWorld(worldsRoot: string): {
  world: World;
  databaseBytes: Uint8Array;
} {
  const store = createWorld(worldsRoot, 'Curse of the Crimson Throne');
  store.putSeat({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
  store.putDocument({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
  const databaseBytes = store.serialize();
  const world = store.world;
  store.close();
  return { world, databaseBytes };
}

describe('exportWorldArchive / importWorldArchive round trip', () => {
  it('restores the world, its seats, its documents, and its assets under a new worlds root', async () => {
    const { world, databaseBytes } = buildFixtureWorld(sourceRoot);
    const paths = resolveWorldPaths(sourceRoot, world.id);
    writeFileSync(join(paths.assetsDir, 'a1b2c3.png'), Buffer.from('pretend png bytes'));
    writeFileSync(
      join(paths.assetsDir, 'd4e5f6.mp3'),
      Buffer.from('pretend audio bytes'),
    );

    const archive = exportWorldArchive(world, databaseBytes, paths.assetsDir);
    const imported = await importWorldArchive(destRoot, archive);

    expect(imported.id).toBe(world.id);
    expect(imported.name).toBe('Curse of the Crimson Throne');

    const restored = openWorld(destRoot, world.id);
    expect(restored.listSeats().map((seat) => seat.name)).toEqual(['Valeros']);
    expect(restored.listDocuments()).toHaveLength(1);
    restored.close();

    const destAssetsDir = resolveWorldPaths(destRoot, world.id).assetsDir;
    expect(readFileSync(join(destAssetsDir, 'a1b2c3.png'), 'utf8')).toBe(
      'pretend png bytes',
    );
    expect(readFileSync(join(destAssetsDir, 'd4e5f6.mp3'), 'utf8')).toBe(
      'pretend audio bytes',
    );
    expect(readdirSync(destAssetsDir).sort()).toEqual(['a1b2c3.png', 'd4e5f6.mp3']);
  });

  it('survives being fed through the reader in arbitrarily tiny, boundary-splitting chunks', async () => {
    const { world, databaseBytes } = buildFixtureWorld(sourceRoot);
    const paths = resolveWorldPaths(sourceRoot, world.id);
    // Larger than any single field in the framing format, so this asset's
    // own content is also guaranteed to span many reads, not just the
    // headers around it.
    const assetContent = Buffer.from('x'.repeat(5000));
    writeFileSync(join(paths.assetsDir, 'big-asset.bin'), assetContent);

    const fullArchive = await collect(
      exportWorldArchive(world, databaseBytes, paths.assetsDir),
    );
    const trickle = Readable.from(tinyChunks(fullArchive, 3));

    const imported = await importWorldArchive(destRoot, trickle);
    expect(imported.id).toBe(world.id);

    const destAssetsDir = resolveWorldPaths(destRoot, world.id).assetsDir;
    expect(readFileSync(join(destAssetsDir, 'big-asset.bin'))).toEqual(assetContent);
  });

  it('creates an (empty) assets directory when the source world had none', async () => {
    const { world, databaseBytes } = buildFixtureWorld(sourceRoot);
    const paths = resolveWorldPaths(sourceRoot, world.id);
    rmSync(paths.assetsDir, { recursive: true, force: true });

    await importWorldArchive(
      destRoot,
      exportWorldArchive(world, databaseBytes, paths.assetsDir),
    );

    const destAssetsDir = resolveWorldPaths(destRoot, world.id).assetsDir;
    expect(existsSync(destAssetsDir)).toBe(true);
    expect(readdirSync(destAssetsDir)).toEqual([]);
  });

  it('skips an entry name it does not recognize instead of failing the import', async () => {
    const { world, databaseBytes } = buildFixtureWorld(sourceRoot);

    const handMade = Buffer.concat([
      buildEntry('world.json', Buffer.from(JSON.stringify(world))),
      buildEntry('a-future-field-this-reader-does-not-know', Buffer.from('surprise!')),
      buildEntry('world.db', Buffer.from(databaseBytes)),
    ]);

    const imported = await importWorldArchive(destRoot, Readable.from([handMade]));
    expect(imported.id).toBe(world.id);
  });
});

describe('importWorldArchive failure modes', () => {
  it('rejects an archive whose world id already exists at the destination, without touching it', async () => {
    const { world, databaseBytes } = buildFixtureWorld(destRoot);
    const paths = resolveWorldPaths(destRoot, world.id);
    const archive = exportWorldArchive(world, databaseBytes, paths.assetsDir);

    await expect(importWorldArchive(destRoot, archive)).rejects.toThrow(/already exists/);

    // The original, un-clobbered world is still intact.
    const stillThere = openWorld(destRoot, world.id);
    expect(stillThere.listSeats().map((seat) => seat.name)).toEqual(['Valeros']);
    stillThere.close();
  });

  it('rejects a truncated archive and leaves no staging directory behind', async () => {
    const { world, databaseBytes } = buildFixtureWorld(sourceRoot);
    const paths = resolveWorldPaths(sourceRoot, world.id);
    const fullArchive = await collect(
      exportWorldArchive(world, databaseBytes, paths.assetsDir),
    );
    const truncated = Readable.from([fullArchive.subarray(0, 20)]);

    await expect(importWorldArchive(destRoot, truncated)).rejects.toThrow(
      /unexpected end/,
    );

    expect(readdirSync(destRoot)).toEqual([]);
  });

  it('rejects an archive missing world.db', async () => {
    const { world } = buildFixtureWorld(sourceRoot);
    const onlyManifest = buildEntry('world.json', Buffer.from(JSON.stringify(world)));

    await expect(
      importWorldArchive(destRoot, Readable.from([onlyManifest])),
    ).rejects.toThrow(/missing world\.json or world\.db/);
    expect(readdirSync(destRoot)).toEqual([]);
  });
});
