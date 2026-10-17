import { describe, expect, it } from 'vitest';

import type { Attribute, ProficiencyRank } from '../content/common.js';
import { characterDataSchema, newCharacterData } from '../content/character.js';
import { deriveSpellcasting, mergeSpellcasting } from '../rules/deriveSpellcasting.js';
import { prepareCharacter } from '../rules/prepareCharacter.js';

/**
 * Spell attack and spell DC for each caster, end to end: the class and level
 * derive the entry (`deriveSpellcasting`), it is merged onto a character with a
 * +4 casting attribute, and `prepareCharacter` builds the statistics. Worked
 * out by hand: +4 and trained at level 1 is attack 4 + 3 = +7 and DC 10 + 4 + 3
 * = 17; expert at level 7 is attack 4 + 11 = +15 and DC 25. The Witch and
 * Sorcerer wait on their tradition choice and have no entry yet, so no spell
 * statistics (`deriveCasters.test.ts`).
 */

const casters: readonly [string, Attribute][] = [
  ['bard', 'cha'],
  ['cleric', 'wis'],
  ['druid', 'wis'],
  ['oracle', 'cha'],
  ['wizard', 'int'],
];

/** The spellcasting rank is the class features' business (`deriveCasters.test.ts`); here it is given. */
function statisticsFor(
  slug: string,
  key: Attribute,
  level: number,
  rank: ProficiencyRank = 'trained',
) {
  const derived = deriveSpellcasting(
    { slug, name: slug },
    level,
    key,
    undefined,
    rank,
  ).spellcasting;
  const base = newCharacterData();
  const data = characterDataSchema.parse({
    ...base,
    level,
    attributes: { ...base.attributes, [key]: 4 },
    keyAttribute: key,
    spellcasting: mergeSpellcasting(
      [],
      derived,
      () => '00000000-0000-4000-8000-000000000001',
    ),
  });
  return prepareCharacter(data).statistics;
}

describe.each(casters)('%s', (slug, key) => {
  const id = '00000000-0000-4000-8000-000000000001';

  it('at level 1 (trained): attack +7, DC 17', () => {
    const s = statisticsFor(slug, key, 1);
    expect(s[`spellAttack:${id}`]?.total).toBe(7);
    expect(s[`spellDc:${id}`]?.total).toBe(17);
  });

  it('at level 7 (expert): attack +15, DC 25', () => {
    const s = statisticsFor(slug, key, 7, 'expert');
    expect(s[`spellAttack:${id}`]?.total).toBe(15);
    expect(s[`spellDc:${id}`]?.total).toBe(25);
  });
});

describe('a class with no entry yet', () => {
  it.each([
    ['witch', 'int'],
    ['sorcerer', 'cha'],
  ] as const)('%s has no spell statistics', (slug, key) => {
    const s = statisticsFor(slug, key, 1);
    expect(Object.keys(s).filter((k) => k.startsWith('spell'))).toEqual([]);
  });
});
