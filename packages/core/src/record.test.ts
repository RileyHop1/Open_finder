import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  baseRecordSchema,
  idSchema,
  schemaVersionSchema,
  timestampSchema,
} from './record.js';

describe('idSchema', () => {
  it('accepts a v4 UUID', () => {
    expect(idSchema.safeParse(crypto.randomUUID()).success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(idSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('timestampSchema', () => {
  it('accepts an ISO 8601 datetime string', () => {
    expect(timestampSchema.safeParse(new Date().toISOString()).success).toBe(true);
  });

  it('rejects a non-ISO date string', () => {
    expect(timestampSchema.safeParse('not a date').success).toBe(false);
  });

  it('rejects an epoch-millisecond number -- timestamps are strings, not numbers', () => {
    expect(timestampSchema.safeParse(Date.now()).success).toBe(false);
  });
});

describe('schemaVersionSchema', () => {
  it.each([0, -1, 1.5])('rejects %s', (value) => {
    expect(schemaVersionSchema.safeParse(value).success).toBe(false);
  });

  it('accepts 1, the first real version', () => {
    expect(schemaVersionSchema.safeParse(1).success).toBe(true);
  });
});

describe('baseRecordSchema', () => {
  function valid() {
    return {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('accepts a well-formed record', () => {
    expect(baseRecordSchema.safeParse(valid()).success).toBe(true);
  });

  it('is exactly the four shared fields -- nothing document-, world-, or seat-specific', () => {
    const parsed = baseRecordSchema.parse(valid());
    expect(Object.keys(parsed).sort()).toEqual([
      'createdAt',
      'id',
      'schemaVersion',
      'updatedAt',
    ]);
  });

  it('extends cleanly, the way Document/World/Seat all rely on', () => {
    const extended = baseRecordSchema.extend({ name: z.string().min(1) });

    expect(extended.safeParse(valid()).success).toBe(false); // missing `name`
    expect(extended.safeParse({ ...valid(), name: 'x' }).success).toBe(true);
    // The base fields are still enforced through the extension, not bypassed.
    expect(extended.safeParse({ ...valid(), id: 'not-a-uuid', name: 'x' }).success).toBe(
      false,
    );
  });
});
