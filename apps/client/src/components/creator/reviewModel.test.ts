import { describe, expect, it } from 'vitest';

import { warningLines, warningText } from './reviewModel.js';

describe('warningText', () => {
  it('words each kind of warning', () => {
    expect(
      warningText({
        kind: 'duplicate-boost',
        level: 1,
        source: 'free',
        attribute: 'str',
      }),
    ).toBe('Strength is boosted twice from the same source (free).');
    expect(warningText({ kind: 'too-many-trained-skills', chosen: 5, allowed: 4 })).toBe(
      '5 skills chosen but only 4 allowed.',
    );
    expect(warningText({ kind: 'key-attribute-not-offered', attribute: 'cha' })).toBe(
      'Charisma is not one of the key attributes this class offers.',
    );
    expect(
      warningText({
        kind: 'skill-trained-twice',
        skill: 'athletics',
        feature: 'animal-order',
      }),
    ).toBe(
      'Animal Order trains Athletics, which is already trained: choose one more skill in the Skills step instead.',
    );
    expect(warningText({ kind: 'too-many-known-spells', chosen: 3, allowed: 2 })).toBe(
      '3 spells chosen to know but your repertoire holds 2.',
    );
    expect(
      warningText({
        kind: 'too-many-book-spells',
        chosen: 6,
        allowed: 5,
        book: 'spellbook',
      }),
    ).toBe('6 rank 1 spells chosen but your spellbook starts with 5.');
    expect(warningText({ kind: 'deity-not-set', classSlug: 'champion' })).toBe(
      'Champion serves a deity: enter its divine font and skill (Class choices step).',
    );
    expect(warningText({ kind: 'font-not-granted', font: 'harm', granted: 'heal' })).toBe(
      'Your deity grants a heal font, not harm.',
    );
    expect(warningText({ kind: 'too-many-cantrips', chosen: 6, allowed: 5 })).toBe(
      '6 cantrips chosen but the class has 5.',
    );
    expect(
      warningText({ kind: 'not-a-spell', packId: 'feats', slug: 'power-attack' }),
    ).toBe('Power Attack was picked as a spell but is not one, so it is left out.');
    expect(
      warningText({ kind: 'choice-not-made', choice: 'instinct', feature: 'instinct' }),
    ).toBe('Instinct still needs a choice (Instinct).');
    expect(
      warningText({ kind: 'choice-not-offered', choice: 'racket', value: 'dragon' }),
    ).toBe('Dragon is not one of the options for Racket.');
  });

  it('says nothing about a missing entry: the preview has no compendium to look in', () => {
    expect(
      warningText({ kind: 'missing-entry', packId: 'feats', slug: 'x' }),
    ).toBeUndefined();
  });
});

describe('warningLines', () => {
  it('drops the silent ones and the repeats', () => {
    const warning = { kind: 'too-many-trained-skills' as const, chosen: 5, allowed: 4 };
    expect(
      warningLines([
        warning,
        { kind: 'missing-entry', packId: 'feats', slug: 'x' },
        warning,
      ]),
    ).toEqual(['5 skills chosen but only 4 allowed.']);
  });
});
