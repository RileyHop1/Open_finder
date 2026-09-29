import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withTransaction } from './transaction.js';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (a TEXT)');
});

afterEach(() => {
  db.close();
});

describe('withTransaction', () => {
  it('commits writes made inside the function on success', () => {
    withTransaction(db, () => {
      db.prepare('INSERT INTO t VALUES (?)').run('x');
    });
    expect(db.prepare('SELECT * FROM t').all()).toHaveLength(1);
  });

  it('rolls back writes made inside the function when it throws', () => {
    expect(() =>
      withTransaction(db, () => {
        db.prepare('INSERT INTO t VALUES (?)').run('x');
        throw new Error('simulated failure');
      }),
    ).toThrow('simulated failure');
    expect(db.prepare('SELECT * FROM t').all()).toHaveLength(0);
  });

  it('re-throws the original error after rolling back', () => {
    class CustomError extends Error {}
    expect(() =>
      withTransaction(db, () => {
        throw new CustomError('specific failure');
      }),
    ).toThrow(CustomError);
  });

  it('returns the function result on success', () => {
    const result = withTransaction(db, () => 42);
    expect(result).toBe(42);
  });

  it('rolls back DDL statements too, not just data writes', () => {
    expect(() =>
      withTransaction(db, () => {
        db.exec('CREATE TABLE rolled_back (a TEXT)');
        throw new Error('fail after DDL');
      }),
    ).toThrow();

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    expect(tables).not.toContain('rolled_back');
  });
});
