import { describe, expect, it } from 'vitest';

import type { SpellcastingEntry } from '../content/spellcasting.js';
import {
  type DerivedSpellcasting,
  addSpellPicks,
  deriveSpellcasting,
  mergeSpellcasting,
} from './deriveSpellcasting.js';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const wizard = { slug: 'wizard', name: 'Wizard' };

describe('deriveSpellcasting', () => {
  it('gives a non-caster, or no class, nothing', () => {
    expect(deriveSpellcasting({ slug: 'fighter', name: 'Fighter' }, 1, 'str')).toEqual({
      warnings: [],
    });
    expect(deriveSpellcasting(undefined, 1, 'int')).toEqual({ warnings: [] });
  });

  it('derives the static parts of a prepared caster at level 1', () => {
    expect(deriveSpellcasting(wizard, 1, 'int').spellcasting).toEqual({
      source: 'class:wizard',
      name: 'Wizard spellcasting',
      kind: 'prepared',
      tradition: 'arcane',
      attribute: 'int',
      rank: 'trained',
      slots: { 1: 2 },
      cantrips: 5,
    });
  });

  it('follows the level: slots open, the proficiency rank rises', () => {
    const at7 = deriveSpellcasting(wizard, 7, 'int').spellcasting;
    expect(at7?.slots).toEqual({ 1: 3, 2: 3, 3: 3, 4: 2 });
    expect(at7?.rank).toBe('expert');
  });

  it('says so, and gives no entry, when the tradition depends on a choice nothing resolves yet', () => {
    const result = deriveSpellcasting({ slug: 'sorcerer', name: 'Sorcerer' }, 1, 'cha');
    expect(result.spellcasting).toBeUndefined();
    expect(result.warnings).toEqual([
      {
        kind: 'spellcasting-tradition-undecided',
        choice: 'bloodline',
        classSlug: 'sorcerer',
      },
    ]);
  });

  it('uses a tradition a caller can resolve for a choice class', () => {
    const result = deriveSpellcasting(
      { slug: 'witch', name: 'Witch' },
      1,
      'int',
      (choice) => (choice === 'patron' ? 'occult' : undefined),
    );
    expect(result.spellcasting?.tradition).toBe('occult');
    expect(result.warnings).toEqual([]);
  });
});

describe('mergeSpellcasting', () => {
  const derivedPrepared = (level: number): DerivedSpellcasting =>
    deriveSpellcasting(wizard, level, 'int').spellcasting as DerivedSpellcasting;
  const derivedSpontaneous = (level: number): DerivedSpellcasting =>
    deriveSpellcasting({ slug: 'bard', name: 'Bard' }, level, 'cha')
      .spellcasting as DerivedSpellcasting;
  let counter = 100;
  const newId = () => ID(++counter);

  it('adds a new, empty entry the first time', () => {
    const [entry, ...rest] = mergeSpellcasting([], derivedPrepared(1), newId);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      kind: 'prepared',
      source: 'class:wizard',
      slots: { '1': 2 },
      prepared: [],
      cantrips: [],
    });
  });

  it('leaves the entries as they were when there is nothing derived (it never removes)', () => {
    const existing = mergeSpellcasting([], derivedPrepared(1), newId);
    expect(mergeSpellcasting(existing, undefined, newId)).toEqual(existing);
  });

  it('raises a prepared caster’s maximums and keeps what was prepared and cast', () => {
    const first = mergeSpellcasting([], derivedPrepared(1), newId);
    const played = first.map((e): SpellcastingEntry =>
      e.kind === 'prepared'
        ? {
            ...e,
            cantrips: [ID(1)],
            prepared: [
              { rank: 1, itemId: ID(2), expended: true },
              { rank: 1, itemId: ID(3), expended: false },
            ],
          }
        : e,
    );
    const [leveled] = mergeSpellcasting(played, derivedPrepared(3), newId);
    expect(leveled).toMatchObject({
      id: played[0]?.id,
      slots: { '1': 3, '2': 2 },
      cantrips: [ID(1)],
      rank: 'trained',
    });
    expect(leveled?.kind === 'prepared' ? leveled.prepared : []).toHaveLength(2);
    expect(leveled?.kind === 'prepared' ? leveled.prepared[0]?.expended : undefined).toBe(
      true,
    );
  });

  it('raises a spontaneous caster’s maximums and keeps the slots used and the repertoire', () => {
    const first = mergeSpellcasting([], derivedSpontaneous(1), newId);
    const played = first.map((e): SpellcastingEntry =>
      e.kind === 'spontaneous'
        ? {
            ...e,
            slots: { '1': { max: 2, used: 1 } },
            repertoire: [ID(4), ID(5)],
            signature: [ID(4)],
          }
        : e,
    );
    const [leveled] = mergeSpellcasting(played, derivedSpontaneous(3), newId);
    expect(leveled).toMatchObject({
      id: played[0]?.id,
      slots: { '1': { max: 3, used: 1 }, '2': { max: 2, used: 0 } },
      repertoire: [ID(4), ID(5)],
      signature: [ID(4)],
    });
  });

  it('adds beside a hand-made entry, and never touches it', () => {
    const byHand: SpellcastingEntry = {
      id: ID(9),
      kind: 'prepared',
      name: 'Hand made',
      tradition: 'primal',
      attribute: 'wis',
      rank: 'expert',
      cantrips: [],
      slots: { '1': 1 },
      prepared: [],
    };
    const merged = mergeSpellcasting([byHand], derivedPrepared(1), newId);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(byHand);
    expect(merged[1]?.source).toBe('class:wizard');
  });

  it('is stable: merging the same derivation twice changes nothing', () => {
    const once = mergeSpellcasting([], derivedPrepared(5), newId);
    expect(mergeSpellcasting(once, derivedPrepared(5), newId)).toEqual(once);
  });
});

describe('addSpellPicks', () => {
  const common = {
    name: 'Invented spellcasting',
    tradition: 'occult',
    attribute: 'cha',
    rank: 'trained',
  } as const;
  const bard: SpellcastingEntry = {
    ...common,
    id: crypto.randomUUID(),
    source: 'class:bard',
    kind: 'spontaneous',
    cantrips: ['a'],
    slots: {},
    repertoire: ['x'],
    signature: [],
  };
  const other: SpellcastingEntry = {
    ...common,
    id: crypto.randomUUID(),
    kind: 'prepared',
    cantrips: [],
    slots: {},
    prepared: [],
  };

  it('adds to the source’s cantrips and repertoire once each, keeping what was there', () => {
    const [next, untouched] = addSpellPicks([bard, other], 'class:bard', {
      cantrips: ['a', 'b', 'b'],
      ranked: ['x', 'y'],
    });
    expect(next?.cantrips).toEqual(['a', 'b']);
    expect(next?.kind === 'spontaneous' ? next.repertoire : []).toEqual(['x', 'y']);
    expect(untouched).toBe(other);
  });

  it('gives a prepared entry the cantrips only', () => {
    const prepared = { ...other, source: 'class:wizard' };
    const [next] = addSpellPicks([prepared], 'class:wizard', {
      cantrips: ['c'],
      ranked: ['y'],
    });
    expect(next).toEqual({ ...prepared, cantrips: ['c'] });
  });
});
