/**
 * The world store: one `node:sqlite` database per world, per ADR 0002 and
 * ADR 0009. This module is deliberately small and boring -- it is the swap
 * point if `node:sqlite`'s still-experimental API changes, so it does
 * nothing clever and imports `node:sqlite` nowhere else in the codebase.
 *
 * Generic on purpose: this module knows about the shared document envelope
 * (`BaseDocument`) and the operation log, not about any concrete document
 * type. A caller reading a document back gets the raw parsed JSON and is
 * expected to validate it against whatever concrete schema it expects --
 * this module doesn't know those schemas exist.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type { AppliedOperation, BaseDocument, World } from '@hearthtable/core';
import { worldSchema } from '@hearthtable/core';

import { runMigrations } from './migrations.js';
import { type WorldPaths, resolveWorldPaths } from './paths.js';
import { withTransaction } from './transaction.js';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    permissions TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS documents_world_type ON documents (world_id, type);

  CREATE TABLE IF NOT EXISTS operations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    seat_id TEXT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS operations_world_sequence ON operations (world_id, sequence);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/** An operation ready to append: everything `AppliedOperation` has except the sequence, which the table assigns. */
export type NewOperation = Omit<AppliedOperation, 'sequence'>;

export interface WorldStore {
  readonly world: World;
  /**
   * Runs `fn` inside a SQLite transaction, committing on return and rolling
   * back on throw -- see `transaction.ts` and ADR 0005: every write goes
   * through a transaction, and this is the one place that's true.
   */
  transaction<T>(fn: () => T): T;
  /** Inserts a new document, or updates it in place if `document.id` already exists. */
  putDocument(document: BaseDocument): void;
  /** Returns the raw parsed JSON body, or undefined if no document has this id. Not validated -- see module doc. */
  getDocument(id: string): unknown;
  /** All documents in this world, optionally filtered by type. Same caveat as `getDocument`. */
  listDocuments(type?: string): unknown[];
  /** Appends an operation to the log, returning it with its assigned sequence. */
  appendOperation(operation: NewOperation): AppliedOperation;
  /** Every operation applied after `sequence`, in order -- what a reconnecting client replays (ADR 0005). */
  listOperationsSince(sequence: number): AppliedOperation[];
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
  close(): void;
}

interface DocumentRow {
  body: string;
}

interface OperationRow {
  sequence: number;
  id: string;
  world_id: string;
  seat_id: string | null;
  type: string;
  payload: string;
  applied_at: string;
}

interface MetaRow {
  value: string;
}

function rowToOperation(row: OperationRow): AppliedOperation {
  const base = {
    id: row.id,
    worldId: row.world_id,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    sequence: row.sequence,
    appliedAt: row.applied_at,
  };
  return row.seat_id === null ? base : { ...base, seatId: row.seat_id };
}

function buildStore(db: DatabaseSync, world: World): WorldStore {
  return {
    world,

    transaction<T>(fn: () => T): T {
      return withTransaction(db, fn);
    },

    putDocument(document: BaseDocument): void {
      db.prepare(
        `INSERT INTO documents (id, world_id, type, schema_version, permissions, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           schema_version = excluded.schema_version,
           permissions = excluded.permissions,
           body = excluded.body,
           updated_at = excluded.updated_at`,
      ).run(
        document.id,
        document.worldId,
        document.type,
        document.schemaVersion,
        JSON.stringify(document.permissions),
        JSON.stringify(document),
        document.createdAt,
        document.updatedAt,
      );
    },

    getDocument(id: string): unknown {
      const row = db.prepare('SELECT body FROM documents WHERE id = ?').get(id) as
        DocumentRow | undefined;
      return row === undefined ? undefined : (JSON.parse(row.body) as unknown);
    },

    listDocuments(type?: string): unknown[] {
      const rows = (type === undefined
        ? db.prepare('SELECT body FROM documents WHERE world_id = ?').all(world.id)
        : db
            .prepare('SELECT body FROM documents WHERE world_id = ? AND type = ?')
            .all(world.id, type)) as unknown as DocumentRow[];
      return rows.map((row) => JSON.parse(row.body) as unknown);
    },

    appendOperation(operation: NewOperation): AppliedOperation {
      const result = db
        .prepare(
          `INSERT INTO operations (id, world_id, seat_id, type, payload, applied_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          operation.id,
          operation.worldId,
          operation.seatId ?? null,
          operation.type,
          JSON.stringify(operation.payload),
          operation.appliedAt,
        );
      return { ...operation, sequence: Number(result.lastInsertRowid) };
    },

    listOperationsSince(sequence: number): AppliedOperation[] {
      const rows = db
        .prepare(
          'SELECT * FROM operations WHERE world_id = ? AND sequence > ? ORDER BY sequence ASC',
        )
        .all(world.id, sequence) as unknown as OperationRow[];
      return rows.map(rowToOperation);
    },

    getMeta(key: string): string | undefined {
      const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
        MetaRow | undefined;
      return row?.value;
    },

    setMeta(key: string, value: string): void {
      db.prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(key, value);
    },

    close(): void {
      db.close();
    },
  };
}

function openDatabase(paths: WorldPaths): DatabaseSync {
  const db = new DatabaseSync(paths.databaseFile);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  runMigrations(db, paths.snapshotsDir);
  return db;
}

/**
 * Creates a brand-new world: a fresh UUID, its folder structure, a
 * `world.json`, and an initialized (empty) database.
 */
export function createWorld(worldsRoot: string, name: string): WorldStore {
  const now = new Date().toISOString();
  const world: World = {
    id: crypto.randomUUID(),
    name,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };

  const paths = resolveWorldPaths(worldsRoot, world.id);
  mkdirSync(paths.assetsDir, { recursive: true });
  mkdirSync(paths.snapshotsDir, { recursive: true });
  writeFileSync(paths.manifestFile, JSON.stringify(world, null, 2));

  return buildStore(openDatabase(paths), world);
}

/**
 * Opens an existing world by id. Throws if no world is found at that path --
 * unlike `@hearthtable/dice`'s parser, this isn't validating untrusted
 * user-typed input where a typed error is the right shape. A missing world
 * here means a caller tried to open an id it should have already confirmed
 * exists via `listWorldIds`, which is a genuine programmer error, not a
 * normal, expected outcome the caller needs to branch on -- the same reason
 * Node's own `readFileSync` throws on a missing file rather than returning
 * a result type.
 */
export function openWorld(worldsRoot: string, worldId: string): WorldStore {
  const paths = resolveWorldPaths(worldsRoot, worldId);
  if (!existsSync(paths.manifestFile)) {
    throw new Error(`no world found at ${paths.root}`);
  }
  const world = worldSchema.parse(JSON.parse(readFileSync(paths.manifestFile, 'utf8')));
  return buildStore(openDatabase(paths), world);
}

/**
 * Lists the ids of every world under `worldsRoot` -- every subdirectory
 * that has a `world.json`. The filesystem is the source of truth; there is
 * no separate registry to keep in sync.
 */
export function listWorldIds(worldsRoot: string): string[] {
  if (!existsSync(worldsRoot)) {
    return [];
  }
  return readdirSync(worldsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(resolveWorldPaths(worldsRoot, id).manifestFile));
}
