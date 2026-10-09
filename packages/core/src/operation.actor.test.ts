import { describe, expect, it } from 'vitest';

import {
  actorCreateOperationSchema,
  actorAddConditionOperationSchema,
  actorAddItemOperationSchema,
  actorApplyBuildOperationSchema,
  actorRemoveConditionOperationSchema,
  actorSetConditionOperationSchema,
  MAX_CONDITION_VALUE,
  actorDeleteOperationSchema,
  actorRemoveItemOperationSchema,
  actorUpdateItemOperationSchema,
  MAX_ITEM_QUANTITY,
  actorUpdateOperationSchema,
  MAX_ACTOR_CHANGES,
  broadcastSchema,
  clientOperationUnionSchema,
} from './operation.js';

const id = () => crypto.randomUUID();

describe('actor.create', () => {
  it('accepts a kind and a name through the union', () => {
    const result = clientOperationUnionSchema.safeParse({
      id: id(),
      type: 'actor.create',
      payload: { kind: 'character', name: 'Invented Hero' },
    });
    expect(result.success).toBe(true);
  });

  it('trims the name', () => {
    const parsed = actorCreateOperationSchema.parse({
      id: id(),
      type: 'actor.create',
      payload: { kind: 'npc', name: '  Innkeeper  ' },
    });
    expect(parsed.payload.name).toBe('Innkeeper');
  });

  it('rejects a blank or overlong name and an unknown kind', () => {
    const base = { id: id(), type: 'actor.create' };
    for (const payload of [
      { kind: 'character', name: '   ' },
      { kind: 'character', name: 'x'.repeat(101) },
      { kind: 'vehicle', name: 'Cart' },
      { name: 'No kind' },
    ]) {
      expect(actorCreateOperationSchema.safeParse({ ...base, payload }).success).toBe(
        false,
      );
    }
  });

  it('drops a system payload a client tries to smuggle in', () => {
    const parsed = actorCreateOperationSchema.parse({
      id: id(),
      type: 'actor.create',
      payload: { kind: 'character', name: 'Hero', system: { level: 20 } },
    });
    expect(parsed.payload).toEqual({ kind: 'character', name: 'Hero' });
  });
});

describe('actor.delete', () => {
  it('accepts an actor id and rejects a malformed one', () => {
    expect(
      actorDeleteOperationSchema.safeParse({
        id: id(),
        type: 'actor.delete',
        payload: { actorId: id() },
      }).success,
    ).toBe(true);
    expect(
      actorDeleteOperationSchema.safeParse({
        id: id(),
        type: 'actor.delete',
        payload: { actorId: 'nope' },
      }).success,
    ).toBe(false);
  });
});

describe('broadcastSchema -- deleted', () => {
  const operation = () => ({
    id: id(),
    worldId: id(),
    type: 'actor.delete',
    payload: {},
    sequence: 1,
    appliedAt: new Date().toISOString(),
  });
  const envelope = () => {
    const now = new Date().toISOString();
    return {
      id: id(),
      worldId: id(),
      type: 'actor',
      schemaVersion: 1,
      permissions: { default: 'observer' as const, seats: {} },
      createdAt: now,
      updatedAt: now,
    };
  };

  it('defaults to no deletions, so an older shape still parses', () => {
    const parsed = broadcastSchema.parse({
      sequence: 1,
      operation: operation(),
      documents: [],
      seats: [],
    });
    expect(parsed.deleted).toEqual([]);
  });

  it('keeps only the envelope of a deleted document, never its body', () => {
    const parsed = broadcastSchema.parse({
      sequence: 1,
      operation: operation(),
      documents: [],
      deleted: [{ ...envelope(), system: { secret: true }, name: 'Hidden' }],
      seats: [],
    });
    expect(parsed.deleted).toHaveLength(1);
    expect(parsed.deleted[0]).not.toHaveProperty('system');
    expect(parsed.deleted[0]).not.toHaveProperty('name');
  });
});

describe('actor.update', () => {
  const update = (changes: unknown) => ({
    id: id(),
    type: 'actor.update',
    payload: { actorId: id(), changes },
  });

  it('accepts a map of paths to values, including null to remove a field', () => {
    const result = clientOperationUnionSchema.safeParse(
      update({ name: 'Valeria', 'system.attributes.str': 4, portrait: null }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an empty change set and a malformed actor id', () => {
    expect(actorUpdateOperationSchema.safeParse(update({})).success).toBe(false);
    expect(
      actorUpdateOperationSchema.safeParse({
        id: id(),
        type: 'actor.update',
        payload: { actorId: 'nope', changes: { name: 'x' } },
      }).success,
    ).toBe(false);
  });

  it('rejects a change set over the limit', () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_ACTOR_CHANGES + 1 }, (_, n) => [
        `system.f${String(n)}`,
        n,
      ]),
    );
    expect(actorUpdateOperationSchema.safeParse(update(many)).success).toBe(false);
    const exactly = Object.fromEntries(
      Array.from({ length: MAX_ACTOR_CHANGES }, (_, n) => [`system.f${String(n)}`, n]),
    );
    expect(actorUpdateOperationSchema.safeParse(update(exactly)).success).toBe(true);
  });
});

describe('actor item operations', () => {
  const base = (type: string, payload: unknown) => ({ id: id(), type, payload });

  it('actor.addItem takes only a pack and a slug, and drops anything else', () => {
    const parsed = actorAddItemOperationSchema.parse(
      base('actor.addItem', {
        actorId: id(),
        packId: 'equipment',
        slug: 'longsword',
        entry: { damage: 'a lot' },
        equipped: true,
      }),
    );
    expect(Object.keys(parsed.payload).sort()).toEqual(['actorId', 'packId', 'slug']);
  });

  it('actor.addItem rejects a missing slug and a malformed actor id', () => {
    expect(
      actorAddItemOperationSchema.safeParse(
        base('actor.addItem', { actorId: id(), packId: 'equipment' }),
      ).success,
    ).toBe(false);
    expect(
      actorAddItemOperationSchema.safeParse(
        base('actor.addItem', { actorId: 'x', packId: 'a', slug: 'b' }),
      ).success,
    ).toBe(false);
  });

  it('actor.updateItem needs equipped or quantity, and bounds the quantity', () => {
    const ids = { actorId: id(), itemId: id() };
    const ok = (extra: object) =>
      actorUpdateItemOperationSchema.safeParse(
        base('actor.updateItem', { ...ids, ...extra }),
      ).success;
    expect(ok({ equipped: true })).toBe(true);
    expect(ok({ equipped: false })).toBe(true);
    expect(ok({ quantity: 3 })).toBe(true);
    expect(ok({ equipped: true, quantity: MAX_ITEM_QUANTITY })).toBe(true);
    expect(ok({})).toBe(false);
    expect(ok({ quantity: 0 })).toBe(false);
    expect(ok({ quantity: 1.5 })).toBe(false);
    expect(ok({ quantity: MAX_ITEM_QUANTITY + 1 })).toBe(false);
  });

  it('actor.updateItem drops a smuggled entry', () => {
    const parsed = actorUpdateItemOperationSchema.parse(
      base('actor.updateItem', {
        actorId: id(),
        itemId: id(),
        equipped: true,
        entry: {},
      }),
    );
    expect(parsed.payload).not.toHaveProperty('entry');
  });

  it('actor.removeItem takes an actor and an item id', () => {
    expect(
      actorRemoveItemOperationSchema.safeParse(
        base('actor.removeItem', { actorId: id(), itemId: id() }),
      ).success,
    ).toBe(true);
    expect(
      actorRemoveItemOperationSchema.safeParse(
        base('actor.removeItem', { actorId: id() }),
      ).success,
    ).toBe(false);
  });

  it('all three route through the union', () => {
    for (const [type, payload] of [
      ['actor.addItem', { actorId: id(), packId: 'a', slug: 'b' }],
      ['actor.updateItem', { actorId: id(), itemId: id(), equipped: true }],
      ['actor.removeItem', { actorId: id(), itemId: id() }],
    ] as const) {
      expect(clientOperationUnionSchema.safeParse(base(type, payload)).success).toBe(
        true,
      );
    }
  });
});

describe('actor condition operations', () => {
  const base = (type: string, payload: unknown) => ({ id: id(), type, payload });
  const actorId = id();

  it('actor.addCondition takes a slug and an optional value of at least 1', () => {
    const ok = (payload: object) =>
      actorAddConditionOperationSchema.safeParse(
        base('actor.addCondition', { actorId, ...payload }),
      ).success;
    expect(ok({ slug: 'prone' })).toBe(true);
    expect(ok({ slug: 'frightened', value: 2 })).toBe(true);
    expect(ok({ slug: 'frightened', value: MAX_CONDITION_VALUE })).toBe(true);
    expect(ok({ slug: 'frightened', value: 0 })).toBe(false);
    expect(ok({ slug: 'frightened', value: 1.5 })).toBe(false);
    expect(ok({ slug: 'frightened', value: MAX_CONDITION_VALUE + 1 })).toBe(false);
  });

  it('actor.setCondition also accepts 0, which removes the condition', () => {
    const ok = (payload: object) =>
      actorSetConditionOperationSchema.safeParse(
        base('actor.setCondition', { actorId, ...payload }),
      ).success;
    expect(ok({ slug: 'frightened', value: 0 })).toBe(true);
    expect(ok({ slug: 'frightened', value: -1 })).toBe(false);
  });

  it.each(['Frightened', 'off guard', 'a_b', '-x', 'x-', '', 'a'.repeat(61), '../x'])(
    'rejects the slug %j',
    (slug) => {
      expect(
        actorRemoveConditionOperationSchema.safeParse(
          base('actor.removeCondition', { actorId, slug }),
        ).success,
      ).toBe(false);
    },
  );

  it('accepts a kebab-case slug and routes all three through the union', () => {
    for (const [type, payload] of [
      ['actor.addCondition', { actorId, slug: 'off-guard' }],
      ['actor.setCondition', { actorId, slug: 'frightened', value: 3 }],
      ['actor.removeCondition', { actorId, slug: 'off-guard' }],
    ] as const) {
      expect(clientOperationUnionSchema.safeParse(base(type, payload)).success).toBe(
        true,
      );
    }
  });
});

describe('actor.adjustCoins', () => {
  const actorId = id();
  const op = (payload: unknown) =>
    clientOperationUnionSchema.safeParse({
      id: id(),
      type: 'actor.adjustCoins',
      payload,
    });

  it('accepts any subset of denominations, positive or negative', () => {
    expect(op({ actorId, delta: { gp: 5 } }).success).toBe(true);
    expect(op({ actorId, delta: { gp: -3, sp: 5, cp: -2 } }).success).toBe(true);
    expect(op({ actorId, delta: {} }).success).toBe(true);
  });

  it('rejects a non-integer denomination, a malformed actor id, and a missing delta', () => {
    expect(op({ actorId, delta: { gp: 1.5 } }).success).toBe(false);
    expect(op({ actorId: 'nope', delta: { gp: 1 } }).success).toBe(false);
    expect(op({ actorId }).success).toBe(false);
  });
});

describe('actor.applyBuild', () => {
  const op = (payload: unknown) => ({ id: id(), type: 'actor.applyBuild', payload });

  it('takes a build and optional level, key attribute and keep paths, and drops anything else', () => {
    const parsed = actorApplyBuildOperationSchema.parse(
      op({
        actorId: id(),
        build: { class: { packId: 'classes', slug: 'x' } },
        level: 5,
        keyAttribute: 'str',
        keep: ['attributes.str', 'ranks.skills.athletics'],
        items: [{ stats: 'a lot' }],
      }),
    );
    expect(Object.keys(parsed.payload).sort()).toEqual([
      'actorId',
      'build',
      'keep',
      'keyAttribute',
      'level',
    ]);
  });

  it('rejects a malformed actor id, a non-object build, a bad level and an unsafe keep path', () => {
    const ok = { actorId: id(), build: {} };
    expect(actorApplyBuildOperationSchema.safeParse(op(ok)).success).toBe(true);
    for (const bad of [
      { ...ok, actorId: 'x' },
      { ...ok, build: 'str' },
      { ...ok, level: 0 },
      { ...ok, level: 21 },
      { ...ok, keep: ['a b'] },
      { ...ok, keep: ['a..b'] },
      { ...ok, keep: Array.from({ length: 101 }, () => 'a') },
    ]) {
      expect(actorApplyBuildOperationSchema.safeParse(op(bad)).success).toBe(false);
    }
  });
});
