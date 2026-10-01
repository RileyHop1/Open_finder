import type { Actor, Seat, Token } from '@hearthtable/core';
import { tokenSchema } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import {
  canMoveToken,
  describeToken,
  initialsOf,
  tokenAt,
  tokenViews,
  UNKNOWN_LABEL,
} from './tokenModel.js';

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

describe('tokenViews selection and movement', () => {
  const hero = { name: 'Valeros' };

  it('marks the selected token and what this seat may move', () => {
    const [mine, theirs] = [makeToken({ name: 'Mine' }), makeToken({ name: 'Theirs' })];
    const views = tokenViews([mine, theirs], 100, () => hero, {
      selectedId: theirs.id,
      canMove: (actorId) => actorId === mine.actorId,
    });
    expect(views.map((v) => [v.label, v.selected, v.movable])).toEqual([
      ['Mine', false, true],
      ['Theirs', true, false],
    ]);
  });

  it('moves and selects nothing by default, and carries the size in squares', () => {
    const [view] = tokenViews([makeToken({ size: 3 })], 100, () => hero);
    expect(view).toMatchObject({ selected: false, movable: false, size: 3 });
  });
});

describe('canMoveToken', () => {
  const world = crypto.randomUUID();
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: world,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const actor = (seats: Record<string, 'owner' | 'observer'> = {}): Actor => ({
    id: crypto.randomUUID(),
    worldId: world,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'A',
    system: {},
  });

  it('lets the GM move anything, even a token whose actor they cannot see', () => {
    expect(canMoveToken(seat(true), undefined)).toBe(true);
  });

  it('lets a player move only tokens of actors they own', () => {
    const me = seat(false);
    expect(canMoveToken(me, actor({ [me.id]: 'owner' }))).toBe(true);
    expect(canMoveToken(me, actor())).toBe(false);
    expect(canMoveToken(me, undefined)).toBe(false);
  });

  it('refuses someone with no seat', () => {
    expect(canMoveToken(undefined, actor())).toBe(false);
  });
});

describe('tokenAt', () => {
  const [a, b] = [makeToken({ x: 200, y: 200 }), makeToken({ x: 230, y: 200 })];
  const views = tokenViews([a, b], 100, () => ({ name: 'X' }));

  it('finds the token whose circle holds the point', () => {
    expect(tokenAt(views, { x: 150, y: 200 })?.id).toBe(a.id);
    expect(tokenAt(views, { x: 280, y: 200 })?.id).toBe(b.id);
  });

  it('prefers the one drawn on top where they overlap', () => {
    expect(tokenAt(views, { x: 215, y: 200 })?.id).toBe(b.id);
  });

  it('finds nothing on empty ground, and counts the rim as inside', () => {
    expect(tokenAt(views, { x: 600, y: 600 })).toBeUndefined();
    expect(tokenAt(views, { x: 150, y: 200 })).toBeDefined();
    expect(tokenAt(views, { x: 149, y: 200 })).toBeUndefined();
  });
});
