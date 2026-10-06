import { describe, expect, it } from 'vitest';

import { actorSchema } from './actor.js';
import {
  actorSetQuickbarOperationSchema,
  clientOperationUnionSchema,
} from './operation.js';
import {
  emptyHotbar,
  HOTBAR_SLOTS,
  hotbarActionSchema,
  hotbarSchema,
  MAX_SITUATIONAL_MODIFIERS,
  situationalModifiersSchema,
  withSituational,
} from './quickbar.js';

const id = () => crypto.randomUUID();

describe('situationalModifiersSchema', () => {
  it('keeps a signed value, an optional trimmed label, and whether it is on', () => {
    const parsed = situationalModifiersSchema.parse([
      { value: 2, label: '  Flanking ', active: true },
      { value: -1, active: false },
    ]);
    expect(parsed).toEqual([
      { value: 2, label: 'Flanking', active: true },
      { value: -1, active: false },
    ]);
  });

  it('rejects fractions, huge values, blank labels, and too many', () => {
    expect(
      situationalModifiersSchema.safeParse([{ value: 1.5, active: true }]).success,
    ).toBe(false);
    expect(
      situationalModifiersSchema.safeParse([{ value: 51, active: true }]).success,
    ).toBe(false);
    expect(
      situationalModifiersSchema.safeParse([{ value: 1, label: '   ', active: true }])
        .success,
    ).toBe(false);
    expect(
      situationalModifiersSchema.safeParse(
        Array.from({ length: MAX_SITUATIONAL_MODIFIERS + 1 }, () => ({
          value: 1,
          active: true,
        })),
      ).success,
    ).toBe(false);
  });
});

describe('hotbarSchema', () => {
  it('is exactly ten positions, each an action or null', () => {
    expect(hotbarSchema.safeParse(emptyHotbar()).success).toBe(true);
    expect(hotbarSchema.safeParse(emptyHotbar().slice(1)).success).toBe(false);
    expect(hotbarSchema.safeParse([...emptyHotbar(), null]).success).toBe(false);
    expect(emptyHotbar()).toHaveLength(HOTBAR_SLOTS);
  });

  it('takes a named action with a cost, and optional dice', () => {
    const action = hotbarActionSchema.parse({
      name: ' Sneak attack ',
      text: 'Stab',
      cost: 2,
      dice: '1d6',
    });
    expect(action).toEqual({ name: 'Sneak attack', text: 'Stab', cost: 2, dice: '1d6' });
    for (const cost of ['free', 'reaction', 1, 3]) {
      expect(hotbarActionSchema.safeParse({ name: 'x', text: '', cost }).success).toBe(
        true,
      );
    }
  });

  it('rejects a blank or over-long name, and an unknown cost', () => {
    expect(hotbarActionSchema.safeParse({ name: '', text: '', cost: 1 }).success).toBe(
      false,
    );
    expect(
      hotbarActionSchema.safeParse({ name: 'x'.repeat(25), text: '', cost: 1 }).success,
    ).toBe(false);
    expect(hotbarActionSchema.safeParse({ name: 'x', text: '', cost: 4 }).success).toBe(
      false,
    );
  });
});

describe('an actor’s quickbar fields', () => {
  const actor = (extra: Record<string, unknown> = {}) => {
    const now = new Date().toISOString();
    return {
      id: id(),
      worldId: id(),
      type: 'actor',
      schemaVersion: 1,
      permissions: { default: 'none', seats: {} },
      createdAt: now,
      updatedAt: now,
      kind: 'character',
      name: 'Ada',
      system: {},
      ...extra,
    };
  };

  it('are absent until saved, so existing actors still load unchanged', () => {
    const parsed = actorSchema.parse(actor());
    expect(parsed.modifiers).toBeUndefined();
    expect(parsed.hotbar).toBeUndefined();
  });

  it('keep saved values, and refuse a malformed hotbar', () => {
    const modifiers = [{ value: 2, label: 'Flanking', active: true }];
    expect(actorSchema.parse(actor({ modifiers })).modifiers).toEqual(modifiers);
    expect(actorSchema.safeParse(actor({ hotbar: [null] })).success).toBe(false);
  });
});

describe('actor.setQuickbar', () => {
  const op = (payload: unknown) =>
    actorSetQuickbarOperationSchema.safeParse({
      id: id(),
      type: 'actor.setQuickbar',
      payload,
    });

  it('accepts either list or both', () => {
    expect(op({ actorId: id(), modifiers: [] }).success).toBe(true);
    expect(op({ actorId: id(), hotbar: emptyHotbar() }).success).toBe(true);
    expect(op({ actorId: id(), modifiers: [], hotbar: emptyHotbar() }).success).toBe(
      true,
    );
  });

  it('needs at least one list, a real id, and valid contents', () => {
    expect(op({ actorId: id() }).success).toBe(false);
    expect(op({ actorId: 'nope', modifiers: [] }).success).toBe(false);
    expect(op({ actorId: id(), hotbar: [null] }).success).toBe(false);
  });
});

describe('withSituational', () => {
  const base = {
    total: 7,
    modifiers: [
      {
        slug: 'str',
        label: 'Strength',
        type: 'ability' as const,
        value: 4,
        source: 'Strength',
        enabled: true,
        applied: true,
      },
    ],
  };

  it('returns the statistic untouched when nothing is added', () => {
    expect(withSituational(base, undefined)).toBe(base);
    expect(withSituational(base, [])).toBe(base);
  });

  it('adds each modifier as an applied, untyped entry and sums them into the total', () => {
    const result = withSituational(base, [
      { value: 2, label: 'Flanking' },
      { value: -1 },
    ]);
    expect(result.total).toBe(8);
    expect(result.modifiers).toHaveLength(3);
    expect(
      result.modifiers.slice(1).map((m) => [m.label, m.value, m.type, m.applied]),
    ).toEqual([
      ['Flanking', 2, 'untyped', true],
      ['Situational', -1, 'untyped', true],
    ]);
    expect(base.total).toBe(7);
  });
});

describe('roll operations with modifiers', () => {
  it('accept an optional list of value and label, capped at ten', () => {
    const roll = (modifiers: unknown) =>
      clientOperationUnionSchema.safeParse({
        id: id(),
        type: 'actor.rollCheck',
        payload: { actorId: id(), statistic: 'perception', modifiers },
      });
    expect(roll([{ value: 2, label: 'Bless' }]).success).toBe(true);
    expect(roll(undefined).success).toBe(true);
    expect(roll([{ value: 99 }]).success).toBe(false);
    expect(roll(Array.from({ length: 11 }, () => ({ value: 1 }))).success).toBe(false);
  });
});
