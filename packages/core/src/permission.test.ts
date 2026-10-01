import { describe, expect, it } from 'vitest';

import type { BaseDocument } from './document.js';
import {
  canReadDocument,
  resolvePermission,
  resolveViewerPermission,
} from './permission.js';
import type { Seat } from './seat.js';

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    worldId: crypto.randomUUID(),
    name: 'Valeros',
    isGM: false,
    ...overrides,
  };
}

function makeDocument(
  worldId: string,
  overrides: Partial<BaseDocument> = {},
): BaseDocument {
  return {
    id: crypto.randomUUID(),
    worldId,
    type: 'party',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('resolvePermission', () => {
  it('a GM seat always resolves to owner, regardless of what the document stores', () => {
    const seat = makeSeat({ isGM: true });
    const document = makeDocument(seat.worldId, {
      permissions: { default: 'none', seats: {} },
    });
    expect(resolvePermission(seat, document)).toBe('owner');
  });

  it("a non-GM seat with no override falls back to the document's default", () => {
    const seat = makeSeat({ isGM: false });
    const document = makeDocument(seat.worldId, {
      permissions: { default: 'limited', seats: {} },
    });
    expect(resolvePermission(seat, document)).toBe('limited');
  });

  it('an explicit per-seat override wins over the default', () => {
    const seat = makeSeat({ isGM: false });
    const document = makeDocument(seat.worldId, {
      permissions: { default: 'none', seats: { [seat.id]: 'owner' } },
    });
    expect(resolvePermission(seat, document)).toBe('owner');
  });

  it('a seat and document from different worlds always resolve to none, even for the GM', () => {
    const seat = makeSeat({ isGM: true });
    const document = makeDocument(crypto.randomUUID()); // a different world entirely
    expect(resolvePermission(seat, document)).toBe('none');
  });

  it("a non-GM seat's own override does not leak to a different seat", () => {
    const seat = makeSeat({ isGM: false });
    const otherSeatId = crypto.randomUUID();
    const document = makeDocument(seat.worldId, {
      permissions: { default: 'none', seats: { [otherSeatId]: 'owner' } },
    });
    expect(resolvePermission(seat, document)).toBe('none');
  });
});

describe('resolveViewerPermission', () => {
  it('gives a viewer with no seat the document default', () => {
    const document = makeDocument(crypto.randomUUID(), {
      permissions: { default: 'observer', seats: {} },
    });
    expect(resolveViewerPermission(undefined, document)).toBe('observer');
  });

  it('defers to resolvePermission when there is a seat', () => {
    const seat = makeSeat({ isGM: true });
    const document = makeDocument(seat.worldId, {
      permissions: { default: 'none', seats: {} },
    });
    expect(resolveViewerPermission(seat, document)).toBe('owner');
  });
});

describe('canReadDocument', () => {
  const worldId = crypto.randomUUID();
  const player = makeSeat({ worldId });
  const withDefault = (level: BaseDocument['permissions']['default']) =>
    makeDocument(worldId, { permissions: { default: level, seats: {} } });

  it.each([
    ['none', false],
    ['limited', false],
    ['observer', true],
    ['owner', true],
  ] as const)('a player with a %s default can read: %s', (level, expected) => {
    expect(canReadDocument(player, withDefault(level))).toBe(expected);
  });

  it('lets a per-seat override raise or lower access', () => {
    const raised = makeDocument(worldId, {
      permissions: { default: 'none', seats: { [player.id]: 'observer' } },
    });
    const lowered = makeDocument(worldId, {
      permissions: { default: 'observer', seats: { [player.id]: 'none' } },
    });
    expect(canReadDocument(player, raised)).toBe(true);
    expect(canReadDocument(player, lowered)).toBe(false);
  });

  it('always lets the GM read, whatever the document stores', () => {
    const gm = makeSeat({ worldId, isGM: true });
    expect(canReadDocument(gm, withDefault('none'))).toBe(true);
  });

  it('judges a viewer with no seat by the document default', () => {
    expect(canReadDocument(undefined, withDefault('observer'))).toBe(true);
    expect(canReadDocument(undefined, withDefault('none'))).toBe(false);
  });

  it("never lets a seat read another world's document", () => {
    const gm = makeSeat({ isGM: true });
    expect(canReadDocument(gm, withDefault('owner'))).toBe(false);
  });
});
