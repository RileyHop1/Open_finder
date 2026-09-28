import { describe, expect, it } from 'vitest';

import { type Seat, seatSchema } from './seat.js';

function validSeat() {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    worldId: crypto.randomUUID(),
    name: 'Valeros',
    isGM: false,
  };
}

describe('seatSchema', () => {
  it('accepts a well-formed, unclaimed player seat with no pin', () => {
    // Also a compile-time check: under exactOptionalPropertyTypes, this object
    // literal (omitting `pin`/`claimedByDeviceToken` entirely, not setting them
    // to undefined) must satisfy the inferred `Seat` type without a cast.
    const seat: Seat = validSeat();
    expect(seatSchema.safeParse(seat).success).toBe(true);
  });

  it('accepts a GM seat with a pin', () => {
    const result = seatSchema.safeParse({ ...validSeat(), isGM: true, pin: '4242' });
    expect(result.success).toBe(true);
  });

  it('accepts a claimed seat carrying a device token', () => {
    const result = seatSchema.safeParse({
      ...validSeat(),
      claimedByDeviceToken: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(seatSchema.safeParse({ ...validSeat(), name: '' }).success).toBe(false);
  });

  it('requires isGM -- there is no default for who is the GM', () => {
    const { isGM: _isGM, ...withoutIsGM } = validSeat();
    expect(seatSchema.safeParse(withoutIsGM).success).toBe(false);
  });

  it('rejects a non-UUID worldId', () => {
    const result = seatSchema.safeParse({ ...validSeat(), worldId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('has no permissions field -- access to a seat is not the document permission scale', () => {
    const parsed = seatSchema.parse(validSeat());
    expect('permissions' in parsed).toBe(false);
  });
});
