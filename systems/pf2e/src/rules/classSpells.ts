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
 * from level 15) that hold only Heal or only Harm, by the font chosen.
 * Classes are added here in their own PRs; one with no row grants nothing.
 */

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
  /** Extra slots at the class's highest rank that hold only one spell (a Cleric's divine font). */
  readonly font?: FontGrant;
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

/** What `classSlug` grants, given the build's class choices. Nothing for a class with no row. */
export function grantedSpells(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
): GrantedSpells {
  const grants = classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug];
  if (grants === undefined) {
    return { focusPoints: 0, cantrips: [], focusSpells: [], ranked: [] };
  }
  const ranked = Object.entries(grants.byChoice).flatMap(([choice, byValue]) => {
    const chosen = classChoices[choice];
    return chosen === undefined ? [] : (byValue[chosen] ?? []);
  });
  return {
    focusPoints: grants.focusPoints,
    cantrips: grants.cantrips,
    focusSpells: grants.focusSpells,
    ranked,
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
