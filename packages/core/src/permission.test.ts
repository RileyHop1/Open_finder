import { describe, expect, it } from 'vitest';

import type { BaseDocument } from './document.js';
import { resolvePermission } from './permission.js';
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
