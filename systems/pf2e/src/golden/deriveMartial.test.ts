import { describe, expect, it } from 'vitest';

import { ancestryEntrySchema } from '../content/ancestry.js';
import { backgroundEntrySchema } from '../content/background.js';
import type { AttributeBoost } from '../content/characterBuild.js';
import { classEntrySchema } from '../content/class.js';
import type { Attribute, ProficiencyRank } from '../content/common.js';
import { mapClass } from '../importer/mapClass.js';
import { deriveCharacter } from '../rules/deriveCharacter.js';
import { attributeModifier } from '../rules/attributes.js';

/**
 * Build-derived level 1 characters for the seven martial classes must equal
 * the hand-set golden characters (`fighter.test.ts` and its siblings): the
 * same attributes, ranks and skills, reached through boosts and a class
 * instead of typed in. The class entries go through the real `mapClass` from
 * upstream-shaped data (starting ranks as numbers, as the pinned upstream has
 * them), so this also pins the importer's output into the derivation.
 *
 * Everything is invented: the ancestry and background are ours, and only the
 * rank numbers and attribute choices mirror the golden fixtures.
 */

const NOW = '2026-10-01T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ancestry = ancestryEntrySchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'ancestries',
  slug: 'invented-folk',
  name: 'Invented Folk',
  kind: 'ancestry',
  provenance: PROVENANCE,
  ruleElements: [],
  description: '',
  hp: 8,
  size: 'medium',
  speed: 25,
});

const background = backgroundEntrySchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'backgrounds',
  slug: 'invented-background',
  name: 'Invented Background',
  kind: 'background',
  provenance: PROVENANCE,
  ruleElements: [],
  description: '',
  boostOptions: ['str', 'dex'],
  trainedSkills: ['invented-lore'],
});

interface Martial {
  name: string;
  hp: number;
  key: Attribute;
  /** Upstream-shaped starting ranks: 0 untrained to 4 legendary. */
  perception: number;
  saves: [number, number, number];
  attacks: [number, number, number, number]; // unarmed, simple, martial, advanced
  defenses: [number, number, number, number]; // unarmored, light, medium, heavy
  automatic: string[];
  chosen: string[];
  /** The boosts, by source (one level 1 batch each). */
  boosts: Record<'ancestry' | 'background' | 'class' | 'free', Attribute[]>;
  /** The hand-set golden's ability scores, and the ranks it expects. */
  scores: Record<Attribute, number>;
  expected: {
    perception: ProficiencyRank;
    fortitude: ProficiencyRank;
    reflex: ProficiencyRank;
    will: ProficiencyRank;
    armor: ['unarmored' | 'light' | 'medium' | 'heavy', ProficiencyRank];
    weapon: ['unarmed' | 'simple' | 'martial' | 'advanced', ProficiencyRank];
    skill: string;
  };
}

const MARTIALS: Martial[] = [
  {
    name: 'Fighter',
    hp: 10,
    key: 'str',
    perception: 2,
    saves: [2, 2, 1],
    attacks: [2, 2, 2, 1],
    defenses: [1, 1, 1, 1],
    automatic: [],
    chosen: ['athletics'],
    boosts: {
      ancestry: ['str', 'con'],
      background: ['str', 'dex'],
      class: ['str'],
      free: ['str', 'dex', 'con', 'wis'],
    },
    scores: { str: 18, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
    expected: {
      perception: 'expert',
      fortitude: 'expert',
      reflex: 'expert',
      will: 'trained',
      armor: ['heavy', 'trained'],
      weapon: ['martial', 'expert'],
      skill: 'athletics',
    },
  },
  {
    name: 'Ranger',
    hp: 10,
    key: 'dex',
    perception: 2,
    saves: [2, 2, 1],
    attacks: [1, 1, 1, 0],
    defenses: [1, 1, 1, 0],
    automatic: ['survival'],
    chosen: [],
    boosts: {
      ancestry: ['dex', 'con'],
      background: ['dex', 'wis'],
      class: ['dex'],
      free: ['dex', 'str', 'con'],
    },
    scores: { str: 12, dex: 18, con: 14, int: 10, wis: 12, cha: 10 },
    expected: {
      perception: 'expert',
      fortitude: 'expert',
      reflex: 'expert',
      will: 'trained',
      armor: ['light', 'trained'],
      weapon: ['martial', 'trained'],
      skill: 'survival',
    },
  },
  {
    name: 'Rogue',
    hp: 8,
    key: 'dex',
    perception: 2,
    saves: [1, 2, 2],
    attacks: [1, 1, 1, 0],
    defenses: [1, 1, 0, 0],
    automatic: ['stealth'],
    chosen: [],
    boosts: {
      ancestry: ['dex', 'cha'],
      background: ['dex', 'wis'],
      class: ['dex'],
      free: ['dex', 'con', 'cha'],
    },
    scores: { str: 10, dex: 18, con: 12, int: 10, wis: 12, cha: 14 },
    expected: {
      perception: 'expert',
      fortitude: 'trained',
      reflex: 'expert',
      will: 'expert',
      armor: ['light', 'trained'],
      weapon: ['simple', 'trained'],
      skill: 'stealth',
    },
  },
  {
    name: 'Barbarian',
    hp: 12,
    key: 'str',
    perception: 2,
    saves: [2, 1, 2],
    attacks: [1, 1, 1, 0],
    defenses: [1, 1, 1, 0],
    automatic: ['athletics'],
    chosen: [],
    boosts: {
      ancestry: ['str', 'con'],
      background: ['str', 'con'],
      class: ['str'],
      free: ['str', 'con', 'dex'],
    },
    scores: { str: 18, dex: 12, con: 16, int: 10, wis: 10, cha: 10 },
    expected: {
      perception: 'expert',
      fortitude: 'expert',
      reflex: 'trained',
      will: 'expert',
      armor: ['medium', 'trained'],
      weapon: ['martial', 'trained'],
      skill: 'athletics',
    },
  },
  {
    name: 'Investigator',
    hp: 8,
    key: 'int',
    perception: 2,
    saves: [1, 2, 2],
    attacks: [1, 1, 1, 0],
    defenses: [1, 1, 0, 0],
    automatic: ['society'],
    chosen: [],
    boosts: {
      ancestry: ['int', 'dex'],
      background: ['int', 'dex'],
      class: ['int'],
      free: ['int', 'dex', 'con'],
    },
    scores: { str: 10, dex: 16, con: 12, int: 18, wis: 10, cha: 10 },
    expected: {
      perception: 'expert',
      fortitude: 'trained',
      reflex: 'expert',
      will: 'expert',
      armor: ['light', 'trained'],
      weapon: ['simple', 'trained'],
      skill: 'society',
    },
  },
  {
    name: 'Monk',
    hp: 10,
    key: 'dex',
    perception: 1,
    saves: [2, 2, 2],
    attacks: [1, 1, 0, 0],
    defenses: [2, 0, 0, 0],
    automatic: [],
    chosen: ['acrobatics'],
    boosts: {
      ancestry: ['dex', 'con'],
      background: ['dex', 'wis'],
      class: ['dex'],
      free: ['dex', 'con', 'wis', 'str'],
    },
    scores: { str: 12, dex: 18, con: 14, int: 10, wis: 14, cha: 10 },
    expected: {
      perception: 'trained',
      fortitude: 'expert',
      reflex: 'expert',
      will: 'expert',
      armor: ['unarmored', 'expert'],
      weapon: ['unarmed', 'trained'],
      skill: 'acrobatics',
    },
  },
  {
    name: 'Swashbuckler',
    hp: 10,
    key: 'dex',
    perception: 2,
    saves: [1, 2, 2],
    attacks: [1, 1, 1, 0],
    defenses: [1, 1, 0, 0],
    automatic: ['acrobatics'],
    chosen: [],
    boosts: {
      ancestry: ['dex', 'con'],
      background: ['dex', 'cha'],
      class: ['dex'],
      free: ['dex', 'con', 'cha', 'wis'],
    },
    scores: { str: 10, dex: 18, con: 14, int: 10, wis: 12, cha: 14 },
    expected: {
      perception: 'expert',
      fortitude: 'trained',
      reflex: 'expert',
      will: 'expert',
      armor: ['light', 'trained'],
      weapon: ['martial', 'trained'],
      skill: 'acrobatics',
    },
  },
];

function classFor(m: Martial) {
  const mapped = mapClass(
    {
      path: `classes/${m.name.toLowerCase()}.json`,
      id: `${m.name}-id`,
      name: m.name,
      type: 'class',
      system: {
        keyAbility: { value: [m.key] },
        hp: m.hp,
        perception: m.perception,
        savingThrows: { fortitude: m.saves[0], reflex: m.saves[1], will: m.saves[2] },
        classDC: null,
        attacks: {
          unarmed: m.attacks[0],
          simple: m.attacks[1],
          martial: m.attacks[2],
          advanced: m.attacks[3],
        },
        defenses: {
          unarmored: m.defenses[0],
          light: m.defenses[1],
          medium: m.defenses[2],
          heavy: m.defenses[3],
        },
        trainedSkills: { value: m.automatic, additional: 3 },
        ancestryFeatLevels: { value: [1, 5] },
        classFeatLevels: { value: [1, 2] },
        generalFeatLevels: { value: [3] },
        skillFeatLevels: { value: [2] },
        skillIncreaseLevels: { value: [3] },
      },
    },
    PROVENANCE,
    NOW,
  );
  if (!mapped.ok) {
    throw new Error(`could not map ${m.name}: ${mapped.reason}`);
  }
  return classEntrySchema.parse(mapped.entry);
}

describe.each(MARTIALS)('$name (level 1), derived from a build', (m) => {
  const boosts: AttributeBoost[] = (
    ['ancestry', 'background', 'class', 'free'] as const
  ).map((source) => ({ level: 1, source, attributes: m.boosts[source] }));
  const derived = deriveCharacter({
    build: {
      flaws: [],
      boosts,
      trainedSkills: m.chosen,
      skillIncreases: [],
      feats: [],
      languages: [],
      classChoices: {},
    },
    level: 1,
    ancestry,
    background,
    class: classFor(m),
    resolve: () => undefined,
  });

  it('has the golden character’s attribute modifiers', () => {
    for (const [attribute, score] of Object.entries(m.scores)) {
      expect(derived.attributes[attribute as Attribute]).toBe(attributeModifier(score));
    }
  });

  it('has the golden character’s ranks and key attribute', () => {
    expect(derived.keyAttribute).toBe(m.key);
    expect(derived.ranks.perception).toBe(m.expected.perception);
    expect(derived.ranks.fortitude).toBe(m.expected.fortitude);
    expect(derived.ranks.reflex).toBe(m.expected.reflex);
    expect(derived.ranks.will).toBe(m.expected.will);
    expect(derived.ranks.classDc).toBe('trained');
    expect(derived.ranks.armor[m.expected.armor[0]]).toBe(m.expected.armor[1]);
    expect(derived.ranks.weapons[m.expected.weapon[0]]).toBe(m.expected.weapon[1]);
    expect(derived.ranks.skills[m.expected.skill]).toBe('trained');
  });

  it('takes HP and speed from the ancestry and class, and warns about nothing', () => {
    expect(derived.ancestryHp).toBe(8);
    expect(derived.classHp).toBe(m.hp);
    expect(derived.speed).toBe(25);
    expect(derived.warnings).toEqual([]);
  });
});
