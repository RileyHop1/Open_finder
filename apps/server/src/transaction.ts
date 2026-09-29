/**
 * `node:sqlite` has no built-in transaction helper, unlike `better-sqlite3`'s
 * `db.transaction()`. This is that missing primitive: `BEGIN` before, `COMMIT`
 * on return, `ROLLBACK` (then re-throw) on throw.
 *
 * Extracted here rather than left inline in `worldStore.ts`, now that the
 * migration runner needs the identical pattern -- two real, independent
 * callers, which is the threshold this project has consistently used before
 * sharing a piece (same reasoning as `record.ts` in `packages/core` and
 * `testHelpers.ts` in the dice arc).
 */

import type { DatabaseSync } from 'node:sqlite';

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
