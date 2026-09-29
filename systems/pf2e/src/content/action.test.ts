import { describe, expect, it } from 'vitest';

import { ACTION_COSTS } from './common.js';
import { actionEntrySchema } from './action.js';

function makeAction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'actions',
    slug: 'escape',
    name: 'Escape',
    kind: 'action',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    actionCost: 'one',
    ...overrides,
  };
}

describe('actionEntrySchema', () => {
  it('accepts a minimal well-formed action', () => {
    expect(actionEntrySchema.safeParse(makeAction()).success).toBe(true);
  });

  it.each(ACTION_COSTS)('accepts the %s action cost', (actionCost) => {
    expect(actionEntrySchema.safeParse(makeAction({ actionCost })).success).toBe(true);
  });

  it('requires an actionCost -- unlike a feat, an action always has one', () => {
    const { actionCost: _actionCost, ...rest } = makeAction();
    expect(actionEntrySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a trait that is not a valid slug', () => {
    expect(
      actionEntrySchema.safeParse(makeAction({ traits: ['Not A Slug'] })).success,
    ).toBe(false);
  });
});
