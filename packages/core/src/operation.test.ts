import { describe, expect, it } from 'vitest';

import {
  appliedOperationSchema,
  broadcastSchema,
  chatSendMessageOperationSchema,
  chatSendRollOperationSchema,
  clientOperationUnionSchema,
  seatClaimOperationSchema,
  seatReleaseOperationSchema,
} from './operation.js';

describe('clientOperationUnionSchema -- seat.claim', () => {
  it('accepts a well-formed claim', () => {
    const result = clientOperationUnionSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: crypto.randomUUID() },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a claim with no target seatId', () => {
    const result = seatClaimOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts a claim with a pin, for claiming a GM seat', () => {
    const result = seatClaimOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: crypto.randomUUID(), pin: '4242' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a claim with no pin -- most seats have none to check', () => {
    const result = seatClaimOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: crypto.randomUUID() },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.hasOwn(result.data.payload, 'pin')).toBe(false);
    }
  });
});

describe('clientOperationUnionSchema -- seat.release', () => {
  it('accepts release with an empty payload -- no target, it is always self', () => {
    const result = seatReleaseOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'seat.release',
      payload: {},
    });
    expect(result.success).toBe(true);
  });
});

describe('clientOperationUnionSchema -- chat.sendMessage', () => {
  it('accepts a plain text message', () => {
    const result = chatSendMessageOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: 'Hello, table.' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty message', () => {
    const result = chatSendMessageOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: '' },
    });
    expect(result.success).toBe(false);
  });
});

describe('clientOperationUnionSchema -- chat.sendRoll', () => {
  it('accepts a raw expression string -- never a pre-computed result', () => {
    const result = chatSendRollOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '1d20+7' },
    });
    expect(result.success).toBe(true);
  });

  it('the payload has no field for a total or a result -- the server always rolls', () => {
    const withResult = chatSendRollOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      // A client cannot smuggle a pre-computed result through this shape --
      // extra keys are simply not part of what this operation carries.
      payload: { expression: '1d20+7', total: 999 },
    });
    expect(withResult.success).toBe(true);
    if (withResult.success) {
      expect('total' in withResult.data.payload).toBe(false);
    }
  });

  it('rejects an expression longer than 200 characters', () => {
    const result = chatSendRollOperationSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '1+'.repeat(150) },
    });
    expect(result.success).toBe(false);
  });

  it('takes an optional label, trimmed, and rejects an empty or over-long one', () => {
    const parse = (label: string) =>
      chatSendRollOperationSchema.safeParse({
        id: crypto.randomUUID(),
        type: 'chat.sendRoll',
        payload: { expression: '1d20+7', label },
      });
    const ok = parse('  Pries the door open  ');
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.payload.label).toBe('Pries the door open');
    }
    expect(parse('   ').success).toBe(false);
    expect(parse('x'.repeat(121)).success).toBe(false);
  });
});

describe('clientOperationUnionSchema -- discrimination', () => {
  it('rejects an unknown operation type', () => {
    const result = clientOperationUnionSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'seat.teleport',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('routes each type to its own payload shape, not a shared one', () => {
    // A seat.claim payload shape sent as chat.sendMessage must fail, proving
    // the union actually discriminates rather than accepting any payload
    // for any type.
    const result = clientOperationUnionSchema.safeParse({
      id: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { seatId: crypto.randomUUID() },
    });
    expect(result.success).toBe(false);
  });
});

describe('appliedOperationSchema', () => {
  function validApplied() {
    return {
      id: crypto.randomUUID(),
      worldId: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: 'hi' },
      sequence: 1,
      appliedAt: new Date().toISOString(),
    };
  }

  it('accepts an applied operation with no seatId -- the claiming operation itself', () => {
    expect(appliedOperationSchema.safeParse(validApplied()).success).toBe(true);
  });

  it('accepts an applied operation with a seatId once one is claimed', () => {
    const result = appliedOperationSchema.safeParse({
      ...validApplied(),
      seatId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive sequence', () => {
    expect(
      appliedOperationSchema.safeParse({ ...validApplied(), sequence: 0 }).success,
    ).toBe(false);
  });
});

describe('broadcastSchema', () => {
  function validDocument(extra: Record<string, unknown> = {}) {
    return {
      id: crypto.randomUUID(),
      worldId: crypto.randomUUID(),
      type: 'party',
      schemaVersion: 1,
      permissions: { default: 'observer' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...extra,
    };
  }

  function validOperation() {
    return {
      id: crypto.randomUUID(),
      worldId: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: 'hi' },
      sequence: 1,
      appliedAt: new Date().toISOString(),
    };
  }

  function validSeat(extra: Record<string, unknown> = {}) {
    return {
      id: crypto.randomUUID(),
      worldId: crypto.randomUUID(),
      schemaVersion: 1,
      name: 'Valeros',
      isGM: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...extra,
    };
  }

  it('accepts a broadcast with no changed documents or seats', () => {
    const result = broadcastSchema.safeParse({
      sequence: 1,
      operation: validOperation(),
      documents: [],
      seats: [],
    });
    expect(result.success).toBe(true);
  });

  it("preserves a concrete document type's own fields -- .loose() must not strip them", () => {
    // This is the exact failure mode a plain z.object() has: it silently
    // strips unknown keys. A future Party document's memberIds must survive
    // being broadcast through this envelope.
    const result = broadcastSchema.safeParse({
      sequence: 1,
      operation: validOperation(),
      documents: [validDocument({ memberIds: ['a', 'b'] })],
      seats: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documents[0]).toMatchObject({ memberIds: ['a', 'b'] });
    }
  });

  it('still enforces the shared envelope fields on each document', () => {
    const result = broadcastSchema.safeParse({
      sequence: 1,
      operation: validOperation(),
      documents: [validDocument({ id: 'not-a-uuid' })],
      seats: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a changed seat, validated fully (not loosely)', () => {
    const result = broadcastSchema.safeParse({
      sequence: 1,
      operation: validOperation(),
      documents: [],
      seats: [validSeat({ claimedByDeviceToken: crypto.randomUUID() })],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seats[0]?.name).toBe('Valeros');
    }
  });

  it('rejects a malformed seat', () => {
    const result = broadcastSchema.safeParse({
      sequence: 1,
      operation: validOperation(),
      documents: [],
      seats: [validSeat({ isGM: 'not-a-boolean' })],
    });
    expect(result.success).toBe(false);
  });

  it('requires the seats field -- it is not optional', () => {
    const result = broadcastSchema.safeParse({
      sequence: 1,
      operation: validOperation(),
      documents: [],
    });
    expect(result.success).toBe(false);
  });
});
