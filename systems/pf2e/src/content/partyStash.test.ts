import { describe, expect, it } from 'vitest';

import type { GearEntry } from '../index.js';
import { newPartyStash, partyStashSchema } from './partyStash.js';

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ROPE: GearEntry = {
  id: '66666666-6666-5666-8666-666666666666',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-rope',
  name: 'Invented Rope',
  kind: 'gear',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
};

describe('partyStashSchema', () => {
  it('defaults to an empty purse and no items', () => {
    const result = partyStashSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coins).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
      expect(result.data.items).toEqual([]);
    }
  });

  it('accepts coins and items, defaulting a stash item quantity to 1', () => {
    const result = partyStashSchema.safeParse({
      coins: { gp: 15 },
      items: [{ id: '77777777-7777-5777-8777-777777777777', entry: ROPE }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coins.gp).toBe(15);
      expect(result.data.items[0]?.quantity).toBe(1);
    }
  });

  it('rejects two stash items sharing an id', () => {
    const duplicateId = '77777777-7777-5777-8777-777777777777';
    const result = partyStashSchema.safeParse({
      items: [
        { id: duplicateId, entry: ROPE },
        { id: duplicateId, entry: ROPE, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a stash item carrying an entry kind that is not carriable (e.g. an ancestry)', () => {
    const result = partyStashSchema.safeParse({
      items: [
        {
          id: '77777777-7777-5777-8777-777777777777',
          entry: { ...ROPE, kind: 'ancestry' },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('newPartyStash', () => {
  it('returns a blank, already-valid stash', () => {
    expect(newPartyStash()).toEqual({ coins: { pp: 0, gp: 0, sp: 0, cp: 0 }, items: [] });
  });
});
