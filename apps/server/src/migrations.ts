/**
 * The forward-only migration runner -- see CLAUDE.md's Data durability
 * section: "schemaVersion on every document, plus a migration runner that
 * runs on world open... Snapshot before every migration."
 *
 * This migrates the *database's own structure* (its tables), tracked by a
 * `schemaVersion` key in the `meta` table -- a different, lower-level concern
 * from a `BaseDocument`'s own `schemaVersion` field, which versions one
 * document's shape, not the database's. No concrete document type exists yet
 * to need the latter, so only this exists so far.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { withTransaction } from './transaction.js';

export interface Migration {
  readonly version: number;
  readonly description: string;
  up(db: DatabaseSync): void;
}

/**
 * v1 is the schema `worldStore.ts` creates directly (`documents`,
 * `operations`, `meta`) -- there was nothing before it to migrate from, so
 * it has no entry here. Every change after v1 is a real, numbered migration,
 * added to the end of this array, never edited or reordered once shipped.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 2,
    description:
      'Add the seats table. Seat (ADR 0007) does not extend the shared ' +
      'document envelope -- no type, no permissions -- so it cannot live in ' +
      'the generic "documents" table and needs its own.',
    up(db) {
      db.exec(`
        CREATE TABLE seats (
          id TEXT PRIMARY KEY,
          world_id TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          name TEXT NOT NULL,
          is_gm INTEGER NOT NULL,
          pin TEXT,
          claimed_by_device_token TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX seats_world ON seats (world_id);
      `);
    },
  },
];

/** The schema version this codebase produces once every migration above has run. */
export const CURRENT_SCHEMA_VERSION: number =
  MIGRATIONS.length === 0
    ? 1
    : Math.max(...MIGRATIONS.map((migration) => migration.version));

const SCHEMA_VERSION_KEY = 'schemaVersion';

function readSchemaVersion(db: DatabaseSync): number {
  const row = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
  return row === undefined ? 1 : Number(row.value);
}

function writeSchemaVersion(db: DatabaseSync, version: number): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SCHEMA_VERSION_KEY, String(version));
}

/**
 * Writes a complete, self-contained copy of `db` into `snapshotsDir`, named
 * by timestamp, and returns its path.
 *
 * Uses `db.serialize()`, never a raw file copy. Verified directly before
 * choosing this: in WAL mode, a plain `fs.copyFileSync` of the main database
 * file can capture an inconsistent, incomplete state, because recent writes
 * may exist only in the `-wal` file and not yet be checkpointed into it --
 * a naive copy of a freshly-written database failed to even open in
 * testing. `serialize()` reflects the database's true logical contents
 * regardless of where its bytes currently live on disk.
 */
export function snapshotDatabase(db: DatabaseSync, snapshotsDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = join(snapshotsDir, `${timestamp}.db`);
  // Defensive: every world created by worldStore.ts already has this
  // directory, but a hand-tampered world folder shouldn't crash a migration
  // with a confusing ENOENT.
  mkdirSync(snapshotsDir, { recursive: true });
  writeFileSync(snapshotPath, db.serialize());
  return snapshotPath;
}

/**
 * Brings `db` forward to the latest version in `migrations`, running each
 * pending one in order. Exported separately from `runMigrations` so a test
 * can inject a migration list containing a deliberately-failing entry,
 * without that entry ever being part of the real, shipped list below.
 *
 * Snapshots before **every individual** migration, not once before the
 * whole pending batch: CLAUDE.md calls for a snapshot before each migration
 * specifically, and a single pre-batch snapshot would leave no recovery
 * point between two migrations if the second failed after the first had
 * already committed.
 */
export function applyMigrations(
  db: DatabaseSync,
  snapshotsDir: string,
  migrations: readonly Migration[],
): void {
  const version = readSchemaVersion(db);
  const pending = [...migrations]
    .filter((migration) => migration.version > version)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    snapshotDatabase(db, snapshotsDir);
    withTransaction(db, () => {
      migration.up(db);
      writeSchemaVersion(db, migration.version);
    });
  }
}

/** Runs every real, shipped migration pending against `db`. See `applyMigrations`. */
export function runMigrations(db: DatabaseSync, snapshotsDir: string): void {
  applyMigrations(db, snapshotsDir, MIGRATIONS);
}
