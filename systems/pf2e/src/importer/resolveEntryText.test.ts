import { describe, expect, it } from 'vitest';

import type { ConditionEntry } from '../content/condition.js';
import type { FeatEntry } from '../content/feat.js';
import type { WeaponEntry } from '../content/weapon.js';
import { deterministicId } from './deterministicId.js';
import { resolveEntryText } from './resolveEntryText.js';

// Synthetic, invented fixtures throughout (ADR 0013), constructed directly
// at the mapped-entry shape -- this pass runs after every mapper, on the
// full kept set, regardless of which mapper produced each entry.
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';

/** A `Compendium....Item.<id>` uuid naming the entry with this upstream id. */
function uuidFor(upstreamId: string): string {
  return `Compendium.pf2e.conditions.Item.${upstreamId}`;
}

function makeCondition(upstreamId: string, name: string, slug: string): ConditionEntry {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'conditions',
    slug,
    name,
    kind: 'condition',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    valued: false,
    overrides: [],
  };
}

function makeFeat(upstreamId: string, text: FeatEntry['text']): FeatEntry {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'feats',
    slug: `invented-feat-${upstreamId}`,
    name: `Invented Feat ${upstreamId}`,
    kind: 'feat',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    text,
    level: 1,
    category: 'general',
    prerequisites: [],
  };
}

function makeWeapon(upstreamId: string): WeaponEntry {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'equipment',
    slug: `invented-weapon-${upstreamId}`,
    name: `Invented Weapon ${upstreamId}`,
    kind: 'weapon',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    category: 'martial',
    group: 'sword',
    damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
    hands: 1,
  };
}

describe('resolveEntryText', () => {
  it('leaves an entry with no text untouched', () => {
    const condition = makeCondition('aaaaaaaaaaaaaaaa', 'Frightened', 'frightened');
    const { entries, warnings } = resolveEntryText([condition]);

    expect(entries).toEqual([condition]);
    expect(warnings).toEqual([]);
  });

  it('resolves a @UUID referencing another kept entry into a term node', () => {
    const condition = makeCondition('aaaaaaaaaaaaaaaa', 'Frightened', 'frightened');
    const feat = makeFeat('bbbbbbbbbbbbbbbb', [
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', value: 'You become ' },
          { kind: 'text', value: `@UUID[${uuidFor('aaaaaaaaaaaaaaaa')}]` },
          { kind: 'text', value: '.' },
        ],
      },
    ]);

    const { entries, warnings } = resolveEntryText([condition, feat]);

    const resolvedFeat = entries.find((entry) => entry.id === feat.id);
    expect(resolvedFeat?.text).toEqual([
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', value: 'You become ' },
          {
            kind: 'term',
            termKind: 'condition',
            slug: 'frightened',
            label: 'Frightened',
          },
          { kind: 'text', value: '.' },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('does not resolve a @UUID targeting a kind without a tooltip yet (e.g. a weapon)', () => {
    const weapon = makeWeapon('cccccccccccccccc');
    const feat = makeFeat('dddddddddddddddd', [
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', value: `@UUID[Compendium.pf2e.equipment.Item.cccccccccccccccc]` },
        ],
      },
    ]);

    const { entries, warnings } = resolveEntryText([weapon, feat]);

    const resolvedFeat = entries.find((entry) => entry.id === feat.id);
    expect(resolvedFeat?.text).toEqual([
      {
        kind: 'paragraph',
        children: [
          {
            kind: 'text',
            value: '@UUID[Compendium.pf2e.equipment.Item.cccccccccccccccc]',
          },
        ],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('unresolved @UUID');
  });

  it('falls back to a literal {label} when the uuid does not resolve within the kept set', () => {
    const feat = makeFeat('eeeeeeeeeeeeeeee', [
      {
        kind: 'paragraph',
        children: [
          {
            kind: 'text',
            value: '@UUID[Compendium.pf2e.feats-srd.Item.notkept]{Toughness}',
          },
        ],
      },
    ]);

    const { entries, warnings } = resolveEntryText([feat]);

    const resolvedFeat = entries.find((entry) => entry.id === feat.id);
    expect(resolvedFeat?.text).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'Toughness' }] },
    ]);
    expect(warnings).toEqual([]);
  });

  it('collects warnings from every entry in the run', () => {
    const first = makeFeat('ffffffffffffffff', [
      { kind: 'paragraph', children: [{ kind: 'text', value: '@Localize[PF2E.Foo]' }] },
    ]);
    const second = makeFeat('1111111111111111', [
      { kind: 'paragraph', children: [{ kind: 'text', value: '@Localize[PF2E.Bar]' }] },
    ]);

    const { warnings } = resolveEntryText([first, second]);

    expect(warnings).toHaveLength(2);
  });
});
