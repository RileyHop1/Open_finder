import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  type Migration,
  applyMigrations,
  runMigrations,
  snapshotDatabase,
} from './migrations.js';

/**
 * A frozen fixture of exactly what a v1 database looks like: `documents`,
 * `operations`, `meta`, nothing else -- deliberately NOT imported from
 * worldStore.ts's own schema constant. A migration test fixture describes
 * what a version looked like at the time, and must stay fixed even if the
 * live schema-creation code changes shape later; importing the live
 * constant would silently let the "v1 fixture" drift into whatever v1
 * currently means, defeating the point of testing a migration against it.
 */
const V1_FIXTURE_SQL = `
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    permissions TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE operations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    seat_id TEXT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

let tempDir: string;
let snapshotsDir: string;
let dbPath: string;
let db: DatabaseSync;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'hearthtable-migrations-test-'));
  snapshotsDir = join(tempDir, 'snapshots');
  dbPath = join(tempDir, 'world.db');
  db = new DatabaseSync(dbPath);
  db.exec(V1_FIXTURE_SQL);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function tableNames(database: DatabaseSync): string[] {
  return (
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

function metaValue(database: DatabaseSync, key: string): string | undefined {
  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value;
}

describe('runMigrations -- the real, shipped migration list', () => {
  it('migrates a v1 fixture forward to CURRENT_SCHEMA_VERSION', () => {
    expect(tableNames(db)).not.toContain('seats');

    runMigrations(db, snapshotsDir);

    expect(tableNames(db)).toContain('seats');
    expect(metaValue(db, 'schemaVersion')).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it('is idempotent -- running it again on an already-migrated database is a no-op', () => {
    runMigrations(db, snapshotsDir);
    expect(() => runMigrations(db, snapshotsDir)).not.toThrow();
    expect(metaValue(db, 'schemaVersion')).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it('the seats table has the columns Seat (ADR 0007) needs', () => {
    runMigrations(db, snapshotsDir);
    const columns = (
      db.prepare('PRAGMA table_info(seats)').all() as { name: string }[]
    ).map((row) => row.name);
    expect(columns.sort()).toEqual(
      [
        'id',
        'world_id',
        'schema_version',
        'name',
        'is_gm',
        'pin',
        'claimed_by_device_token',
        'created_at',
        'updated_at',
      ].sort(),
    );
  });
});

describe('runMigrations -- snapshotting', () => {
  it('writes a snapshot before the migration runs', () => {
    runMigrations(db, snapshotsDir);
    const files = readdirSync(snapshotsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.db$/);
  });

  it('the snapshot captures the PRE-migration state, not the post-migration one', () => {
    runMigrations(db, snapshotsDir);
    const [snapshotFile] = readdirSync(snapshotsDir);
    expect(snapshotFile).toBeDefined();

    const snapshotDb = new DatabaseSync(join(snapshotsDir, snapshotFile as string));
    expect(tableNames(snapshotDb)).not.toContain('seats');
    snapshotDb.close();
  });
});

describe('applyMigrations -- rollback on failure', () => {
  it('leaves no trace of a migration whose up() throws', () => {
    const failingMigrations: readonly Migration[] = [
      {
        version: 2,
        description: 'deliberately broken, for this test only',
        up(database) {
          database.exec('CREATE TABLE seats (id TEXT PRIMARY KEY)');
          throw new Error('simulated migration failure');
        },
      },
    ];

    expect(() => applyMigrations(db, snapshotsDir, failingMigrations)).toThrow(
      'simulated migration failure',
    );

    // The CREATE TABLE ran inside the same transaction as the throw, so it
    // must have been rolled back along with everything else.
    expect(tableNames(db)).not.toContain('seats');
    // And the version marker must not have advanced, so a retry (once the
    // bug is fixed) will pick this migration back up rather than skipping it.
    expect(metaValue(db, 'schemaVersion')).toBeUndefined();
  });

  it('a migration after a failed one never runs', () => {
    const order: number[] = [];
    const migrations: readonly Migration[] = [
      {
        version: 2,
        description: 'fails',
        up() {
          throw new Error('boom');
        },
      },
      {
        version: 3,
        description: 'should never run',
        up() {
          order.push(3);
        },
      },
    ];

    expect(() => applyMigrations(db, snapshotsDir, migrations)).toThrow('boom');
    expect(order).toEqual([]);
  });
});

describe('applyMigrations -- ordering and filtering', () => {
  it('only runs migrations newer than the current version, in version order', () => {
    const order: number[] = [];
    const migrations: readonly Migration[] = [
      { version: 3, description: '', up: () => order.push(3) },
      { version: 2, description: '', up: () => order.push(2) },
    ];

    applyMigrations(db, snapshotsDir, migrations);
    expect(order).toEqual([2, 3]); // ran in version order, not array order
  });

  it('skips migrations at or below the current version', () => {
    applyMigrations(db, snapshotsDir, [
      {
        version: 2,
        description: '',
        up: (database) => database.exec('CREATE TABLE seats (id TEXT)'),
      },
    ]);

    const order: number[] = [];
    applyMigrations(db, snapshotsDir, [
      { version: 2, description: 're-run of an old migration', up: () => order.push(2) },
      { version: 3, description: 'new', up: () => order.push(3) },
    ]);

    expect(order).toEqual([3]); // v2 was already applied; only v3 is new
  });
});

describe('snapshotDatabase', () => {
  it('produces a file containing an exact copy of the current data', () => {
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('probe', 'value-before-snapshot')",
    ).run();

    const snapshotPath = snapshotDatabase(db, snapshotsDir);
    expect(existsSync(snapshotPath)).toBe(true);

    const snapshotDb = new DatabaseSync(snapshotPath);
    expect(metaValue(snapshotDb, 'probe')).toBe('value-before-snapshot');
    snapshotDb.close();
  });

  it('creates snapshotsDir if it does not already exist', () => {
    const nestedSnapshotsDir = join(tempDir, 'does', 'not', 'exist', 'yet');
    expect(() => snapshotDatabase(db, nestedSnapshotsDir)).not.toThrow();
    expect(existsSync(nestedSnapshotsDir)).toBe(true);
  });
});
