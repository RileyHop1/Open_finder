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

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type { AppliedOperation, BaseDocument, Seat, World } from '@hearthtable/core';
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

  CREATE TABLE IF NOT EXISTS turn_undo_steps (
    step INTEGER PRIMARY KEY AUTOINCREMENT,
    combat_id TEXT NOT NULL,
    combatant_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    seat_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS turn_undo_documents (
    step INTEGER NOT NULL,
    document_id TEXT NOT NULL,
    before TEXT,
    PRIMARY KEY (step, document_id)
  );
`;

/** Whose turn an undo step belongs to: one combat's one combatant, in one round (ADR 0019). */
export interface UndoTurn {
  combatId: string;
  combatantId: string;
  round: number;
}

/** One undoable step of the current turn, oldest first by `step`. */
export interface UndoStep extends UndoTurn {
  step: number;
  /** The seat whose spend opened the step: the one player allowed to undo it. */
  seatId: string;
}

/** A document as it was before a step first touched it. `before` is `null` when the step created it. */
export interface UndoDocument {
  documentId: string;
  before: unknown;
}

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
  /** Deletes the document with this id. Returns whether one existed. */
  deleteDocument(id: string): boolean;
  /** Returns the raw parsed JSON body, or undefined if no document has this id. Not validated -- see module doc. */
  getDocument(id: string): unknown;
  /** All documents in this world, optionally filtered by type, oldest-created first. Same not-validated caveat as `getDocument`. */
  listDocuments(type?: string): unknown[];
  /** Appends an operation to the log, returning it with its assigned sequence. */
  appendOperation(operation: NewOperation): AppliedOperation;
  /** Every operation applied after `sequence`, in order -- what a reconnecting client replays (ADR 0005). */
  listOperationsSince(sequence: number): AppliedOperation[];
  /** Inserts a new seat, or updates it in place if `seat.id` already exists. */
  putSeat(seat: Seat): void;
  getSeat(id: string): Seat | undefined;
  /** Every seat in this world -- what the lobby lists. */
  listSeats(): Seat[];
  /** The seat currently claimed by `deviceToken`, if any -- for auto-rejoin on reconnect (ADR 0007). */
  getSeatByDeviceToken(deviceToken: string): Seat | undefined;
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
  /** The current turn's undo steps, oldest first (ADR 0019). */
  listUndoSteps(): UndoStep[];
  /** Opens a new undo step for `turn`, returning its step number. */
  openUndoStep(turn: UndoTurn, seatId: string): number;
  /** Records `documentId`'s state before `step` touched it. Ignored if `step` already has one: only the first touch counts. */
  putUndoDocument(step: number, documentId: string, before: unknown): void;
  /** The documents `step` touched, with what each looked like before. */
  listUndoDocuments(step: number): UndoDocument[];
  /** Forgets one step and its documents. */
  deleteUndoStep(step: number): void;
  /** Forgets every step: a turn ended, or the stack belongs to a turn that is no longer running. */
  clearUndo(): void;
  /**
   * A complete, self-contained snapshot of this world's database, reflecting
   * every committed write regardless of where its bytes currently live on
   * disk (WAL mode can leave recent commits only in the `-wal` file). Used
   * by world export (`worldArchive.ts`) and by `migrations.ts`'s own
   * pre-migration snapshots -- the same reason both avoid a raw file copy.
   */
  serialize(): Uint8Array;
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

interface UndoStepRow {
  step: number;
  combat_id: string;
  combatant_id: string;
  round: number;
  seat_id: string;
}

interface UndoDocumentRow {
  document_id: string;
  before: string | null;
}

interface SeatRow {
  id: string;
  world_id: string;
  schema_version: number;
  name: string;
  is_gm: number; // SQLite has no boolean column type; stored as 0/1
  pin: string | null;
  claimed_by_device_token: string | null;
  created_at: string;
  updated_at: string;
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

function rowToSeat(row: SeatRow): Seat {
  return {
    id: row.id,
    worldId: row.world_id,
    schemaVersion: row.schema_version,
    name: row.name,
    isGM: row.is_gm !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.pin === null ? {} : { pin: row.pin }),
    ...(row.claimed_by_device_token === null
      ? {}
      : { claimedByDeviceToken: row.claimed_by_device_token }),
  };
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

    deleteDocument(id: string): boolean {
      const result = db
        .prepare('DELETE FROM documents WHERE id = ? AND world_id = ?')
        .run(id, world.id);
      return Number(result.changes) > 0;
    },

    getDocument(id: string): unknown {
      const row = db.prepare('SELECT body FROM documents WHERE id = ?').get(id) as
        DocumentRow | undefined;
      return row === undefined ? undefined : (JSON.parse(row.body) as unknown);
    },

    listDocuments(type?: string): unknown[] {
      const rows = (type === undefined
        ? db
            .prepare(
              'SELECT body FROM documents WHERE world_id = ? ORDER BY created_at ASC',
            )
            .all(world.id)
        : db
            .prepare(
              'SELECT body FROM documents WHERE world_id = ? AND type = ? ORDER BY created_at ASC',
            )
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

    putSeat(seat: Seat): void {
      db.prepare(
        `INSERT INTO seats (id, world_id, schema_version, name, is_gm, pin, claimed_by_device_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           schema_version = excluded.schema_version,
           name = excluded.name,
           is_gm = excluded.is_gm,
           pin = excluded.pin,
           claimed_by_device_token = excluded.claimed_by_device_token,
           updated_at = excluded.updated_at`,
      ).run(
        seat.id,
        seat.worldId,
        seat.schemaVersion,
        seat.name,
        seat.isGM ? 1 : 0,
        seat.pin ?? null,
        seat.claimedByDeviceToken ?? null,
        seat.createdAt,
        seat.updatedAt,
      );
    },

    getSeat(id: string): Seat | undefined {
      const row = db.prepare('SELECT * FROM seats WHERE id = ?').get(id) as
        SeatRow | undefined;
      return row === undefined ? undefined : rowToSeat(row);
    },

    listSeats(): Seat[] {
      const rows = db
        .prepare('SELECT * FROM seats WHERE world_id = ?')
        .all(world.id) as unknown as SeatRow[];
      return rows.map(rowToSeat);
    },

    getSeatByDeviceToken(deviceToken: string): Seat | undefined {
      const row = db
        .prepare('SELECT * FROM seats WHERE world_id = ? AND claimed_by_device_token = ?')
        .get(world.id, deviceToken) as SeatRow | undefined;
      return row === undefined ? undefined : rowToSeat(row);
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

    listUndoSteps(): UndoStep[] {
      const rows = db
        .prepare('SELECT * FROM turn_undo_steps ORDER BY step ASC')
        .all() as unknown as UndoStepRow[];
      return rows.map((row) => ({
        step: row.step,
        combatId: row.combat_id,
        combatantId: row.combatant_id,
        round: row.round,
        seatId: row.seat_id,
      }));
    },

    openUndoStep(turn: UndoTurn, seatId: string): number {
      const result = db
        .prepare(
          'INSERT INTO turn_undo_steps (combat_id, combatant_id, round, seat_id) VALUES (?, ?, ?, ?)',
        )
        .run(turn.combatId, turn.combatantId, turn.round, seatId);
      return Number(result.lastInsertRowid);
    },

    putUndoDocument(step: number, documentId: string, before: unknown): void {
      db.prepare(
        'INSERT OR IGNORE INTO turn_undo_documents (step, document_id, before) VALUES (?, ?, ?)',
      ).run(step, documentId, before === null ? null : JSON.stringify(before));
    },

    listUndoDocuments(step: number): UndoDocument[] {
      const rows = db
        .prepare('SELECT document_id, before FROM turn_undo_documents WHERE step = ?')
        .all(step) as unknown as UndoDocumentRow[];
      return rows.map((row) => ({
        documentId: row.document_id,
        before: row.before === null ? null : (JSON.parse(row.before) as unknown),
      }));
    },

    deleteUndoStep(step: number): void {
      db.prepare('DELETE FROM turn_undo_documents WHERE step = ?').run(step);
      db.prepare('DELETE FROM turn_undo_steps WHERE step = ?').run(step);
    },

    clearUndo(): void {
      db.exec('DELETE FROM turn_undo_documents; DELETE FROM turn_undo_steps;');
    },

    serialize(): Uint8Array {
      return db.serialize();
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

/**
 * Reads every world's manifest under `worldsRoot` -- for a listing screen,
 * where the caller wants the actual `World` data, not just ids. Reads
 * `world.json` only; never opens a database, since a listing has no need
 * for one.
 */
export function listWorlds(worldsRoot: string): World[] {
  return listWorldIds(worldsRoot).map((id) => {
    const paths = resolveWorldPaths(worldsRoot, id);
    return worldSchema.parse(JSON.parse(readFileSync(paths.manifestFile, 'utf8')));
  });
}

/**
 * Deletes `worldId`'s entire folder -- the database, its WAL/SHM files,
 * every asset, every snapshot. The caller must ensure nothing holds the
 * database open first (the active world's `DatabaseSync`, in particular):
 * this only removes files, it never closes a handle. A no-op if the world
 * doesn't exist.
 */
export function deleteWorld(worldsRoot: string, worldId: string): void {
  const paths = resolveWorldPaths(worldsRoot, worldId);
  rmSync(paths.root, { recursive: true, force: true });
}
