import type { Token } from '@hearthtable/core';
import { tokenSchema } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { describeToken, initialsOf, tokenViews, UNKNOWN_LABEL } from './tokenModel.js';

const NOW = '2026-10-01T00:00:00.000Z';

const makeToken = (overrides: Record<string, unknown> = {}): Token =>
  tokenSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'token',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    sceneId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    x: 250,
    y: 350,
    ...overrides,
  });

describe('initialsOf', () => {
  it('takes the first and last word, upper-cased', () => {
    expect(initialsOf('Goblin Warrior')).toBe('GW');
    expect(initialsOf('Lady Ann of the Keep')).toBe('LK');
  });

  it('is one letter for one word, and a question mark for nothing', () => {
    expect(initialsOf('valeros')).toBe('V');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('')).toBe('?');
  });

  it('takes a whole character, not half of one', () => {
    expect(initialsOf('😀 Smile')).toBe('😀S');
  });
});

describe('tokenViews', () => {
  const hero = { name: 'Valeros', portrait: 'p.png' };

  it('sizes the footprint from the token’s squares and the grid’s cell', () => {
    const [view] = tokenViews([makeToken({ size: 2 })], 100, () => hero);
    expect(view).toMatchObject({ diameter: 200, x: 250, y: 350 });
    expect(tokenViews([makeToken({ size: 1 })], 70, () => hero)[0]?.diameter).toBe(70);
  });

  it('labels it with its own name first, then the actor’s', () => {
    const named = makeToken({ name: 'Goblin 2' });
    expect(tokenViews([named], 100, () => hero)[0]?.label).toBe('Goblin 2');
    expect(tokenViews([makeToken()], 100, () => hero)[0]?.label).toBe('Valeros');
  });

  it('still shows a token whose actor this seat cannot see, as unknown and not openable', () => {
    const [view] = tokenViews([makeToken()], 100, () => undefined);
    expect(view).toMatchObject({
      label: UNKNOWN_LABEL,
      initials: 'U',
      portrait: undefined,
      openable: false,
    });
  });

  it('carries the portrait and whether it is hidden', () => {
    const [view] = tokenViews([makeToken({ hidden: true })], 100, () => hero);
    expect(view).toMatchObject({ portrait: 'p.png', hidden: true, openable: true });
  });

  it('keeps the order it was given', () => {
    const [a, b] = [makeToken({ name: 'A' }), makeToken({ name: 'B' })];
    expect(tokenViews([b, a], 100, () => hero).map((v) => v.label)).toEqual(['B', 'A']);
  });
});

describe('describeToken', () => {
  it('says "hidden" in words', () => {
    expect(describeToken({ label: 'Goblin', hidden: true })).toBe('Goblin (hidden)');
    expect(describeToken({ label: 'Goblin', hidden: false })).toBe('Goblin');
  });
});
