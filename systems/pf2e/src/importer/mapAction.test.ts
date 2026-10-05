import { describe, expect, it } from 'vitest';

import { mapAction } from './mapAction.js';
import { deterministicId } from './deterministicId.js';
import type { UpstreamEntry } from './reader.js';

// Synthetic, invented upstream-shaped fixtures throughout (ADR 0013).
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';

function makeEntry(
  system: Record<string, unknown>,
  overrides: Partial<UpstreamEntry> = {},
): UpstreamEntry {
  return {
    path: 'actions/invented-action.json',
    id: 'bbbbbbbbbbbbbbbb',
    name: 'Invented Action',
    type: 'action',
    system,
    ...overrides,
  };
}

describe('mapAction -- success', () => {
  it('maps a well-formed action', () => {
    const result = mapAction(
      makeEntry({
        actionType: { value: 'action' },
        actions: { value: 2 },
        slug: 'invented-action',
        traits: { value: ['manipulate'] },
        description: { value: '<p>Do a thing.</p>' },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('bbbbbbbbbbbbbbbb'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'actions',
        slug: 'invented-action',
        name: 'Invented Action',
        kind: 'action',
        provenance: PROVENANCE,
        traits: ['manipulate'],
        ruleElements: [],
        description: '<p>Do a thing.</p>',
        text: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Do a thing.' }] }],
        actionCost: 'two',
      },
    });
  });

  it('maps a reaction', () => {
    const result = mapAction(
      makeEntry({ actionType: { value: 'reaction' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.actionCost).toBe('reaction');
    }
  });

  it('derives a slug from the name when system.slug is absent', () => {
    const result = mapAction(
      makeEntry({ actionType: { value: 'free' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.slug).toBe('invented-action');
    }
  });
});

describe('mapAction -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapAction(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing action cost -- unlike a feat, an action always has one', () => {
    expect(mapAction(makeEntry({}), PROVENANCE, IMPORTED_AT)).toEqual({
      ok: false,
      reason: 'missing-or-unrecognized-action-cost',
    });
  });

  it('rejects a passive action type -- there is no passive action, only a passive feat', () => {
    expect(
      mapAction(makeEntry({ actionType: { value: 'passive' } }), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'missing-or-unrecognized-action-cost',
    });
  });
});
