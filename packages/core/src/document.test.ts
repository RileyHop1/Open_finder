import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  PERMISSION_LEVELS,
  baseDocumentSchema,
  documentPermissionsSchema,
  permissionLevelSchema,
} from './document.js';

function validDocument() {
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'party',
    schemaVersion: 1,
    permissions: { default: 'observer' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('permissionLevelSchema', () => {
  it.each(PERMISSION_LEVELS)('accepts %s', (level) => {
    expect(permissionLevelSchema.safeParse(level).success).toBe(true);
  });

  it('rejects a level outside the four-value scale', () => {
    expect(permissionLevelSchema.safeParse('admin').success).toBe(false);
  });
});

describe('documentPermissionsSchema', () => {
  it('defaults seats to an empty object when omitted', () => {
    const result = documentPermissionsSchema.safeParse({ default: 'none' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seats).toEqual({});
    }
  });

  it('accepts explicit per-seat overrides', () => {
    const seatId = crypto.randomUUID();
    const result = documentPermissionsSchema.safeParse({
      default: 'none',
      seats: { [seatId]: 'owner' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seats[seatId]).toBe('owner');
    }
  });

  it('rejects an invalid level on a per-seat override', () => {
    const result = documentPermissionsSchema.safeParse({
      default: 'none',
      seats: { [crypto.randomUUID()]: 'admin' },
    });
    expect(result.success).toBe(false);
  });

  it('requires a default level -- there is no baked-in fallback', () => {
    const result = documentPermissionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('baseDocumentSchema', () => {
  it('accepts a well-formed document envelope', () => {
    const result = baseDocumentSchema.safeParse(validDocument());
    expect(result.success).toBe(true);
  });

  it.each(['id', 'worldId'])('rejects a non-UUID %s', (field) => {
    const doc = { ...validDocument(), [field]: 'not-a-uuid' };
    expect(baseDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects an empty type', () => {
    const result = baseDocumentSchema.safeParse({ ...validDocument(), type: '' });
    expect(result.success).toBe(false);
  });

  it.each([0, -1, 1.5])('rejects a schemaVersion of %s', (schemaVersion) => {
    const result = baseDocumentSchema.safeParse({ ...validDocument(), schemaVersion });
    expect(result.success).toBe(false);
  });

  it('accepts schemaVersion 1, the first real version', () => {
    const result = baseDocumentSchema.safeParse({ ...validDocument(), schemaVersion: 1 });
    expect(result.success).toBe(true);
  });

  it.each(['createdAt', 'updatedAt'])('rejects a malformed %s', (field) => {
    const doc = { ...validDocument(), [field]: 'not a date' };
    expect(baseDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('a concrete document type can extend the base and narrow `type`', () => {
    // Exercises the exact composition pattern documented on baseDocumentSchema,
    // proving it actually works rather than just reading plausibly.
    const partySchema = baseDocumentSchema.extend({
      type: z.literal('party'),
      memberIds: z.array(z.uuid()),
    });

    const valid = partySchema.safeParse({
      ...validDocument(),
      type: 'party',
      memberIds: [],
    });
    expect(valid.success).toBe(true);

    const wrongType = partySchema.safeParse({
      ...validDocument(),
      type: 'actor',
      memberIds: [],
    });
    expect(wrongType.success).toBe(false);
  });
});
