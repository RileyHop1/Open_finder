import { describe, expect, it } from 'vitest';

import { applyChanges, parsePath } from './patch.js';
import { OperationRejected } from './rejection.js';

describe('parsePath', () => {
  it('splits a dotted path, allowing letters, digits, underscores, and hyphens', () => {
    expect(parsePath('system.ranks.skills.academia-lore')).toEqual([
      'system',
      'ranks',
      'skills',
      'academia-lore',
    ]);
    expect(parsePath('a_1.B-2')).toEqual(['a_1', 'B-2']);
  });

  it.each(['', '.', 'a..b', 'a.', '.a', 'a b', 'a[0]', 'a/b', 'a.$b', 'a.é'])(
    'rejects %j',
    (path) => {
      expect(() => parsePath(path)).toThrow(OperationRejected);
    },
  );

  it.each([
    '__proto__',
    'constructor',
    'prototype',
    'a.__proto__.b',
    'system.constructor',
  ])('refuses the prototype-polluting path %s', (path) => {
    expect(() => parsePath(path)).toThrow(/invalid field path/);
  });
});

describe('applyChanges', () => {
  it('sets a top-level and a nested field', () => {
    const target: Record<string, unknown> = { name: 'A', system: { level: 1 } };
    applyChanges(target, { name: 'B', 'system.level': 2 });
    expect(target).toEqual({ name: 'B', system: { level: 2 } });
  });

  it('creates missing objects along a set path', () => {
    const target: Record<string, unknown> = { system: {} };
    applyChanges(target, { 'system.ranks.skills.athletics': 'trained' });
    expect(target).toEqual({ system: { ranks: { skills: { athletics: 'trained' } } } });
  });

  it('removes a field for null, leaving its siblings', () => {
    const target: Record<string, unknown> = { a: { b: 1, c: 2 } };
    applyChanges(target, { 'a.b': null });
    expect(target).toEqual({ a: { c: 2 } });
    expect('b' in (target['a'] as object)).toBe(false);
  });

  it('treats removing a field under a missing parent as a no-op', () => {
    const target: Record<string, unknown> = { a: 1 };
    applyChanges(target, { 'x.y.z': null });
    expect(target).toEqual({ a: 1 });
  });

  it('refuses to go through an array or a primitive', () => {
    expect(() => applyChanges({ items: [1, 2] }, { 'items.0': 5 })).toThrow(
      /items is not an object/,
    );
    expect(() => applyChanges({ level: 1 }, { 'level.x': 5 })).toThrow(
      /level is not an object/,
    );
  });

  it('can replace a field with an object or an array value', () => {
    const target: Record<string, unknown> = { a: 1 };
    applyChanges(target, { a: { nested: true }, b: [1, 2] });
    expect(target).toEqual({ a: { nested: true }, b: [1, 2] });
  });

  it('cannot pollute Object.prototype', () => {
    const target: Record<string, unknown> = {};
    expect(() => applyChanges(target, { '__proto__.polluted': true })).toThrow(
      OperationRejected,
    );
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('applies changes in order, so a later entry sees an earlier one', () => {
    const target: Record<string, unknown> = {};
    applyChanges(target, { 'a.b': 1, 'a.c': 2 });
    expect(target).toEqual({ a: { b: 1, c: 2 } });
  });
});
