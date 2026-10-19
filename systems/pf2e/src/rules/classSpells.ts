/**
 * The spells and focus points a caster class grants by itself (ADR 0025,
 * `docs/spellcasting.md`), beyond the cantrips and spells the player picks. The
 * imported class features say this only in prose (the Bard's Composition Spells
 * and its muses carry no grant elements), so, like the slot tables, it is our own
 * authored data, keyed by spell slug in the `spells` pack.
 *
 * Checked against the pinned upstream text (2026-10-16), never copied: the Bard's
 * Composition Spells feature names Counter Performance and Courageous Anthem and
 * a focus pool of 1, and each muse names the spell it adds to the repertoire. The
 * Cleric's Divine Font gives 4 extra slots at the highest rank (5 from level 5, 6
 * from level 15) that hold only Heal or only Harm, by the font chosen. The
 * Druid's Druidic Order gives a focus pool of 1 and each core order names its
 * order spell (Animal: Heal Animal, Leaf: Cornucopia, Storm: Tempest Surge,
 * Untamed: Untamed Shift). The Witch's Hex Spells give a focus pool of 1, and each
 * patron's lesson names a hex cantrip and the spell the familiar learns; the first
 * hex (Patron's Puppet or Phase Familiar) and Wilding Steward's familiar spell
 * (Summon Animal or Summon Plant or Fungus) are picks, in `spellChoices` (checked
 * 2026-10-18). A Wizard starts with a focus pool of 1 and its school's initial school
 * spell, and every school but Unified Magical Theory adds a curriculum: an extra
 * cantrip and an extra slot at each rank up to 9 (the 10th rank's slot takes no extra
 * slots), for curriculum spells only, and two rank 1 curriculum spells in the
 * spellbook (Unified Magical Theory: one rank 1 spell of any kind) (checked 2026-10-19).
 * An Oracle starts with a focus pool of 1 and its mystery's initial revelation spell,
 * and its mystery's granted spells: a cantrip and a rank 1 spell at level 1, and each
 * higher one once the Oracle can cast spells of its rank (checked 2026-10-19).
 * Classes are added here in their own PRs; one with no row grants nothing.
 */

import { rankOpensAt } from './spellcastingTables.js';

export interface ClassSpellGrants {
  /** The focus pool the class starts with. */
  readonly focusPoints: number;
  /** Cantrips the class grants, in addition to the ones picked (a Bard's composition cantrip). */
  readonly cantrips: readonly string[];
  /** Focus spells the class grants (cast with a focus point). */
  readonly focusSpells: readonly string[];
  /**
   * Spells a class choice adds to the repertoire or spellbook, by the choice (its
   * `rollOptionPrefix`, as `build.classChoices` keys it) and the chosen value.
   */
  readonly byChoice: Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >;
  /**
   * Ranked spells a class choice adds by spell rank, each once the class can cast that
   * rank (an Oracle's mystery's granted spells), keyed like `byChoice` and then by rank.
   */
  readonly byChoiceAtRank?: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<number, readonly string[]>>>>>
  >;
  /** Cantrips a class choice grants, keyed like `byChoice` (a Witch's patron's hex cantrip). */
  readonly cantripsByChoice?: Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >;
  /** Focus spells a class choice grants, keyed like `byChoice` (a Druid's order spell). */
  readonly focusByChoice?: Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >;
  /** Extra slots at the class's highest rank that hold only one spell (a Cleric's divine font). */
  readonly font?: FontGrant;
  /** Picks between named spells the class makes in the spells step (a Witch's first hex). */
  readonly spellChoices?: readonly SpellChoice[];
  /** Extra prepared slots for a class choice's own list (a Wizard's school curriculum). */
  readonly curriculum?: CurriculumGrant;
}

/**
 * Extra slots that hold only spells from a class choice's list: a Wizard's school
 * curriculum. They become their own prepared entry beside the class's
 * (`deriveSpellcasting.ts`, `deriveCurriculum`); what goes in them is play, and
 * nothing checks that it is on the list (ADR 0023).
 */
export interface CurriculumGrant {
  /** What the sheet calls the entry. */
  readonly name: string;
  /** The class choice whose list it is (its `rollOptionPrefix`). */
  readonly choice: string;
  /** Values of the choice that have no curriculum (Unified Magical Theory). */
  readonly without: readonly string[];
  /** Rank 1 spells from the curriculum the book starts with, beyond its own (a Wizard's 2). */
  readonly bookSpells: number;
  /** Rank 1 spells of any kind a value `without` one adds instead (Unified Magical Theory's 1). */
  readonly bookSpellsWithout: number;
}

/**
 * A pick between named spells that no class feature's choice set carries (the Witch's
 * Hex Spells only says it in prose). The creator's spells step offers it, and the
 * chosen slug is stored in `build.classChoices` under `key`.
 */
export interface SpellChoice {
  /** The key the pick is stored under in `build.classChoices`. */
  readonly key: string;
  /** The class feature that asks for it, for the review's `choice-not-made` warning. */
  readonly feature: string;
  /** Where the chosen spell goes: a focus spell, or a ranked one (the familiar's). */
  readonly as: 'focus' | 'ranked';
  /** The spell slugs to choose from. */
  readonly options: readonly string[];
  /** Offered only while another class choice has this value (Wilding Steward's familiar spell). */
  readonly when?: { readonly choice: string; readonly value: string };
}

/**
 * Slots that hold only one spell, chosen by a class choice: a Cleric's Divine Font
 * prepares only Heal or only Harm in its extra slots. They become their own prepared
 * entry with that spell in every slot (`deriveSpellcasting.ts`, `prepareFont`).
 */
export interface FontGrant {
  /** What the sheet calls the entry. */
  readonly name: string;
  /** The class choice that picks the spell (its `rollOptionPrefix`). */
  readonly choice: string;
  /** The spell slug for each value of the choice. */
  readonly spells: Readonly<Record<string, string>>;
  /** How many slots from a level on, `[level, count]` in rising order. */
  readonly slots: readonly (readonly [number, number])[];
}

export const CLASS_SPELL_GRANTS: Readonly<Record<string, ClassSpellGrants>> = {
  bard: {
    focusPoints: 1,
    cantrips: ['courageous-anthem'],
    focusSpells: ['counter-performance'],
    byChoice: {
      muse: {
        enigma: ['sure-strike'],
        maestro: ['soothe'],
        polymath: ['phantasmal-minion'],
        warrior: ['fear'],
      },
    },
  },
  druid: {
    focusPoints: 1,
    cantrips: [],
    focusSpells: [],
    byChoice: {},
    focusByChoice: {
      druidicOrder: {
        'animal-order': ['heal-animal'],
        'leaf-order': ['cornucopia'],
        'storm-order': ['tempest-surge'],
        'untamed-order': ['untamed-shift'],
      },
    },
  },
  witch: {
    focusPoints: 1,
    cantrips: [],
    focusSpells: [],
    byChoice: {
      patron: {
        'faiths-flamekeeper': ['command'],
        'silence-in-snow': ['gust-of-wind'],
        'spinner-of-threads': ['sure-strike'],
        'starless-shadow': ['fear'],
        'the-inscribed-one': ['runic-weapon'],
        'the-resentment': ['enfeeble'],
      },
    },
    cantripsByChoice: {
      patron: {
        'faiths-flamekeeper': ['stoke-the-heart'],
        'silence-in-snow': ['clinging-ice'],
        'spinner-of-threads': ['nudge-fate'],
        'starless-shadow': ['shroud-of-night'],
        'the-inscribed-one': ['discern-secrets'],
        'the-resentment': ['evil-eye'],
        'wilding-steward': ['wilding-word'],
      },
    },
    spellChoices: [
      {
        key: 'first-hex',
        feature: 'hex-spells',
        as: 'focus',
        options: ['patrons-puppet', 'phase-familiar'],
      },
      {
        key: 'familiar-spell',
        feature: 'wilding-steward',
        as: 'ranked',
        options: ['summon-animal', 'summon-plant-or-fungus'],
        when: { choice: 'patron', value: 'wilding-steward' },
      },
    ],
  },
  wizard: {
    focusPoints: 1,
    cantrips: [],
    focusSpells: [],
    byChoice: {},
    focusByChoice: {
      arcaneSchool: {
        'school-of-ars-grammatica': ['protective-wards'],
        'school-of-battle-magic': ['force-bolt'],
        'school-of-civic-wizardry': ['earthworks'],
        'school-of-mentalism': ['charming-push'],
        'school-of-protean-form': ['scramble-body'],
        'school-of-the-boundary': ['fortify-summoning'],
        'school-of-unified-magical-theory': ['hand-of-the-apprentice'],
      },
    },
    curriculum: {
      name: 'Curriculum',
      choice: 'arcaneSchool',
      without: ['school-of-unified-magical-theory'],
      bookSpells: 2,
      bookSpellsWithout: 1,
    },
  },
  oracle: {
    focusPoints: 1,
    cantrips: [],
    focusSpells: [],
    byChoice: {},
    byChoiceAtRank: {
      mystery: {
        ancestors: { 1: ['ill-omen'], 2: ['ghostly-carrier'], 5: ['dreaming-potential'] },
        battle: { 1: ['sure-strike'], 2: ['telekinetic-maneuver'], 4: ['weapon-storm'] },
        bones: { 1: ['grim-tendrils'], 2: ['false-vitality'], 3: ['ghostly-weapon'] },
        cosmos: { 1: ['dizzying-colors'], 2: ['darkness'], 5: ['moon-frenzy'] },
        flames: { 1: ['breathe-fire'], 2: ['blazing-bolt'], 3: ['fireball'] },
        life: { 1: ['soothe'], 2: ['false-vitality'], 5: ['grisly-growths'] },
        lore: { 1: ['mindlink'], 3: ['hypercognition'], 6: ['never-mind'] },
        tempest: {
          1: ['thunderstrike'],
          4: ['hydraulic-torrent'],
          6: ['chain-lightning'],
        },
      },
    },
    cantripsByChoice: {
      mystery: {
        ancestors: ['guidance'],
        battle: ['shield'],
        bones: ['void-warp'],
        cosmos: ['light'],
        flames: ['ignition'],
        life: ['vitality-lash'],
        lore: ['read-aura'],
        tempest: ['electric-arc'],
      },
    },
    focusByChoice: {
      mystery: {
        ancestors: ['ancestral-touch'],
        battle: ['weapon-trance'],
        bones: ['soul-siphon'],
        cosmos: ['spray-of-stars'],
        flames: ['incendiary-aura'],
        life: ['life-link'],
        lore: ['brain-drain'],
        tempest: ['tempest-touch'],
      },
    },
  },
  cleric: {
    focusPoints: 0,
    cantrips: [],
    focusSpells: [],
    byChoice: {},
    font: {
      name: 'Divine Font',
      choice: 'divine-font',
      spells: { heal: 'heal', harm: 'harm' },
      slots: [
        [1, 4],
        [5, 5],
        [15, 6],
      ],
    },
  },
};

/** The pack every granted spell slug above names. */
export const CLASS_SPELLS_PACK = 'spells';

export interface GrantedSpells {
  readonly focusPoints: number;
  readonly cantrips: readonly string[];
  readonly focusSpells: readonly string[];
  /** Spells for the repertoire (spontaneous) or the spellbook (prepared). */
  readonly ranked: readonly string[];
}

/** A spell choice as the build stands: what was chosen, if it is one of the options. */
export interface OfferedSpellChoice extends SpellChoice {
  readonly chosen: string | undefined;
}

/** The spell choices `classSlug` offers given the build's class choices (a `when` that holds, or none). */
export function spellChoicesFor(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
): OfferedSpellChoice[] {
  const choices =
    classSlug === undefined ? [] : (CLASS_SPELL_GRANTS[classSlug]?.spellChoices ?? []);
  return choices
    .filter((c) => c.when === undefined || classChoices[c.when.choice] === c.when.value)
    .map((c) => {
      const value = classChoices[c.key];
      return {
        ...c,
        chosen: value !== undefined && c.options.includes(value) ? value : undefined,
      };
    });
}

/**
 * The spells `byChoiceAtRank` adds at `level`, with the choice each came from: those of
 * every rank open by then (rank 1 at level 1, rank r at 2r - 1).
 */
export function rankedByChoice(
  grants: ClassSpellGrants | undefined,
  classChoices: Readonly<Record<string, string>>,
  level: number,
): { readonly slug: string; readonly choice: string }[] {
  return Object.entries(grants?.byChoiceAtRank ?? {}).flatMap(([choice, byValue]) => {
    const chosen = classChoices[choice];
    const byRank = chosen === undefined ? undefined : byValue[chosen];
    return Object.entries(byRank ?? {})
      .filter(([rank]) => rankOpensAt(Number(rank)) <= level)
      .flatMap(([, slugs]) => slugs.map((slug) => ({ slug, choice })));
  });
}

/**
 * What `classSlug` grants at `level`, given the build's class choices. Nothing for a
 * class with no row.
 */
export function grantedSpells(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
  level = 1,
): GrantedSpells {
  const grants = classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug];
  if (grants === undefined) {
    return { focusPoints: 0, cantrips: [], focusSpells: [], ranked: [] };
  }
  const chosenFrom = (table: ClassSpellGrants['byChoice']) =>
    Object.entries(table).flatMap(([choice, byValue]) => {
      const chosen = classChoices[choice];
      return chosen === undefined ? [] : (byValue[chosen] ?? []);
    });
  const picked = (as: SpellChoice['as']) =>
    spellChoicesFor(classSlug, classChoices).flatMap((c) =>
      c.as === as && c.chosen !== undefined ? [c.chosen] : [],
    );
  return {
    focusPoints: grants.focusPoints,
    cantrips: [...grants.cantrips, ...chosenFrom(grants.cantripsByChoice ?? {})],
    focusSpells: [
      ...grants.focusSpells,
      ...chosenFrom(grants.focusByChoice ?? {}),
      ...picked('focus'),
    ],
    ranked: [
      ...chosenFrom(grants.byChoice),
      ...rankedByChoice(grants, classChoices, level).map((r) => r.slug),
      ...picked('ranked'),
    ],
  };
}

export interface FontAtLevel {
  readonly name: string;
  /** The spell the slots hold, or `undefined` while the choice is not made. */
  readonly spell: string | undefined;
  readonly count: number;
}

/** The font `classSlug` has at `level`, or `undefined` for a class with none. */
export function fontAt(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
  level: number,
): FontAtLevel | undefined {
  const font = classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug]?.font;
  if (font === undefined) {
    return undefined;
  }
  const count = font.slots.reduce((n, [from, slots]) => (level >= from ? slots : n), 0);
  const chosen = classChoices[font.choice];
  return {
    name: font.name,
    spell: chosen === undefined ? undefined : font.spells[chosen],
    count,
  };
}

/**
 * The name of the curriculum entry `classSlug` has, given the build's class choices:
 * `undefined` for a class with none, while the choice is unmade, or for a value
 * without one.
 */
export function curriculumFor(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
): string | undefined {
  const curriculum =
    classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug]?.curriculum;
  const chosen = curriculum === undefined ? undefined : classChoices[curriculum.choice];
  return chosen === undefined ||
    curriculum === undefined ||
    curriculum.without.includes(chosen)
    ? undefined
    : curriculum.name;
}

/**
 * How many rank 1 spells `classSlug`'s curriculum (or a choice without one) adds to its
 * book, given the build's class choices: 0 for a class with none or while the choice is
 * unmade.
 */
export function curriculumBookSpells(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
): number {
  const curriculum =
    classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug]?.curriculum;
  const chosen = curriculum === undefined ? undefined : classChoices[curriculum.choice];
  if (curriculum === undefined || chosen === undefined) {
    return 0;
  }
  return curriculum.without.includes(chosen)
    ? curriculum.bookSpellsWithout
    : curriculum.bookSpells;
}
