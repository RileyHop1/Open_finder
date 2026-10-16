/**
 * The spells and focus points a caster class grants by itself (ADR 0025,
 * `docs/spellcasting.md`), beyond the cantrips and spells the player picks. The
 * imported class features say this only in prose (the Bard's Composition Spells
 * and its muses carry no grant elements), so, like the slot tables, it is our own
 * authored data, keyed by spell slug in the `spells` pack.
 *
 * Checked against the pinned upstream text (2026-10-16), never copied: the Bard's
 * Composition Spells feature names Counter Performance and Courageous Anthem and
 * a focus pool of 1, and each muse names the spell it adds to the repertoire.
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
