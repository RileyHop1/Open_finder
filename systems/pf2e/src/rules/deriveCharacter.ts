/**
 * `deriveCharacter`: turns a character's build choices and the compendium
 * entries they point at into the numbers and items the sheet stores (ADR
 * 0024, `docs/character-build.md`). Pure: the caller (the server's
 * `actor.applyBuild`) fetches the entries and writes the result.
 *
 * It *proposes*. Nothing here refuses a choice; a rules problem comes back
 * in `warnings` and the value is still derived (ADR 0023). Rank-ups beyond a
 * class's starting ranks are not derived yet (upstream does not carry them,
 * `docs/character-build.md` "Rank-ups"), so ranks are correct at the level
 * the imported progressions cover -- level 1 -- and skill increases are
 * applied on top.
 */

import type { AncestryEntry } from '../content/ancestry.js';
import type { BackgroundEntry } from '../content/background.js';
import type { CharacterBuild } from '../content/characterBuild.js';
import type { CharacterItem, CharacterRanks } from '../content/character.js';
import type { ClassEntry, ClassFeatureEntry } from '../content/class.js';
import { rankAtLevel } from '../content/class.js';
import type { Attribute, ProficiencyRank } from '../content/common.js';
import type { HeritageEntry } from '../content/heritage.js';
import { applyBoosts, type BoostWarning } from './boosts.js';
import {
  type DerivedSpellcasting,
  type SpellcastingWarning,
  deriveSpellcasting,
} from './deriveSpellcasting.js';
import { featSlotsUpTo, skillIncreasesUpTo } from './progression.js';

type ItemEntry = CharacterItem['entry'];

/** How deep `grantItem` chains are followed before giving up (a feat granting a feat granting a feat). */
export const MAX_GRANT_DEPTH = 3;

export interface DeriveInputs {
  readonly build: CharacterBuild;
  readonly level: number;
  /** The key attribute the player chose; defaults to the class's first option. */
  readonly keyAttribute?: Attribute | undefined;
  readonly ancestry?: AncestryEntry | undefined;
  readonly heritage?: HeritageEntry | undefined;
  readonly background?: BackgroundEntry | undefined;
  readonly class?: ClassEntry | undefined;
  /** Every feature of the class (any level); the ones due by `level` are granted. */
  readonly classFeatures?: readonly ClassFeatureEntry[] | undefined;
  /** Finds a compendium entry by pack and slug, for picked feats and `grantItem` elements. */
  readonly resolve: (packId: string, slug: string) => ItemEntry | undefined;
}

export type DeriveWarning =
  | BoostWarning
  | SpellcastingWarning
  | { readonly kind: 'key-attribute-not-offered'; readonly attribute: Attribute }
  | {
      readonly kind: 'too-many-trained-skills';
      readonly chosen: number;
      readonly allowed: number;
    }
  | { readonly kind: 'skill-increase-not-available'; readonly level: number }
  | {
      readonly kind: 'feat-slot-not-available';
      readonly slot: string;
      readonly level: number;
    }
  | { readonly kind: 'missing-entry'; readonly packId: string; readonly slug: string }
  /** A choice a granted feature asks for (instinct, racket, ...) that the build has not made yet. */
  | {
      readonly kind: 'choice-not-made';
      readonly choice: string;
      readonly feature: string;
    }
  /** A spell pick that names something other than a spell. Not granted. */
  | { readonly kind: 'not-a-spell'; readonly packId: string; readonly slug: string }
  /** More cantrips picked than the class has. All are granted. */
  | {
      readonly kind: 'too-many-cantrips';
      readonly chosen: number;
      readonly allowed: number;
    }
  /** A choice the build made that is not among the options the feature offers. Still applied. */
  | {
      readonly kind: 'choice-not-offered';
      readonly choice: string;
      readonly value: string;
    };

export interface DerivedCharacter {
  readonly level: number;
  readonly attributes: Readonly<Record<Attribute, number>>;
  readonly keyAttribute: Attribute;
  readonly ranks: CharacterRanks;
  readonly ancestryHp: number;
  readonly classHp: number;
  readonly speed: number;
  /** Class features due by `level`, plus picked feats and everything they grant, de-duplicated. */
  readonly items: readonly ItemEntry[];
  /** The choices made for the features above, keyed by the choice (`rollOptionPrefix`): what the sheet stores as the character's `choices`. */
  readonly choices: Readonly<Record<string, string>>;
  /** The spellcasting the class gives at this level (its static parts); absent for a class that does not cast, or whose tradition is not yet decided. */
  readonly spellcasting: DerivedSpellcasting | undefined;
  /** The picked spells that resolved, by compendium ref; the caller puts their item ids in the class entry's lists. */
  readonly spellPicks: {
    readonly cantrips: readonly { readonly packId: string; readonly slug: string }[];
    readonly ranked: readonly { readonly packId: string; readonly slug: string }[];
  };
  readonly warnings: readonly DeriveWarning[];
}

const RANK_ORDER: readonly ProficiencyRank[] = [
  'untrained',
  'trained',
  'expert',
  'master',
  'legendary',
];

/** One step up the rank ladder (a skill increase), stopping at legendary. */
function nextRank(rank: ProficiencyRank): ProficiencyRank {
  const index = RANK_ORDER.indexOf(rank);
  return RANK_ORDER[Math.min(index + 1, RANK_ORDER.length - 1)] ?? rank;
}

const key = (packId: string, slug: string) => `${packId}/${slug}`;

/** The ranks a class gives at `level`, before skills. */
function classRanks(cls: ClassEntry | undefined, level: number): CharacterRanks {
  const at = (p: Parameters<typeof rankAtLevel>[0] | undefined) =>
    p === undefined ? 'untrained' : rankAtLevel(p, level);
  const p = cls?.proficiencies;
  return {
    perception: at(p?.perception),
    fortitude: at(p?.savingThrows.fortitude),
    reflex: at(p?.savingThrows.reflex),
    will: at(p?.savingThrows.will),
    classDc: at(p?.classDc),
    weapons: {
      unarmed: at(p?.weapons.unarmed),
      simple: at(p?.weapons.simple),
      martial: at(p?.weapons.martial),
      advanced: at(p?.weapons.advanced),
    },
    armor: {
      unarmored: at(p?.armor.unarmored),
      light: at(p?.armor.light),
      medium: at(p?.armor.medium),
      heavy: at(p?.armor.heavy),
    },
    skills: {},
  };
}

export function deriveCharacter(inputs: DeriveInputs): DerivedCharacter {
  const { build, level } = inputs;
  const warnings: DeriveWarning[] = [];

  // Attributes: every flaw and boost replayed from +0.
  const boosts = applyBoosts(build.boosts, build.flaws, level);
  warnings.push(...boosts.warnings);

  // The key attribute: the player's choice, else the class's first option.
  const options = inputs.class?.keyAttributeOptions ?? [];
  const keyAttribute: Attribute = inputs.keyAttribute ?? options[0] ?? 'str';
  if (options.length > 0 && !options.includes(keyAttribute)) {
    warnings.push({ kind: 'key-attribute-not-offered', attribute: keyAttribute });
  }

  // Ranks: the class's, then skills (automatic, background, chosen), then increases.
  const base = classRanks(inputs.class, level);
  const skills: Record<string, ProficiencyRank> = {};
  const train = (skill: string) => {
    skills[skill] = 'trained';
  };
  (inputs.class?.skills.automaticallyTrained ?? []).forEach(train);
  (inputs.background?.trainedSkills ?? []).forEach(train);
  build.trainedSkills.forEach(train);

  const allowed =
    (inputs.class?.skills.trainedSkillCount ?? 0) + Math.max(0, boosts.attributes.int);
  if (inputs.class !== undefined && build.trainedSkills.length > allowed) {
    warnings.push({
      kind: 'too-many-trained-skills',
      chosen: build.trainedSkills.length,
      allowed,
    });
  }

  const increaseLevels = skillIncreasesUpTo(level, inputs.class?.advancement);
  const increases = [...build.skillIncreases]
    .filter((i) => i.level <= level)
    .sort((a, b) => a.level - b.level);
  for (const increase of increases) {
    if (!increaseLevels.includes(increase.level)) {
      warnings.push({ kind: 'skill-increase-not-available', level: increase.level });
    }
    skills[increase.skill] = nextRank(skills[increase.skill] ?? 'untrained');
  }

  // Items: class features due by level, picked feats, then everything they grant.
  const items: ItemEntry[] = [];
  const choices: Record<string, string> = {};
  const seen = new Set<string>();
  const add = (entry: ItemEntry, depth: number) => {
    const id = key(entry.packId, entry.slug);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    items.push(entry);
    if (depth >= MAX_GRANT_DEPTH) {
      return;
    }
    for (const element of entry.ruleElements) {
      if (element.kind === 'grantItem') {
        const granted = inputs.resolve(element.packId, element.slug);
        if (granted === undefined) {
          warnings.push({
            kind: 'missing-entry',
            packId: element.packId,
            slug: element.slug,
          });
        } else {
          add(granted, depth + 1);
        }
      } else if (element.kind === 'choiceSet') {
        const chosen = build.classChoices[element.rollOptionPrefix];
        if (chosen === undefined) {
          warnings.push({
            kind: 'choice-not-made',
            choice: element.rollOptionPrefix,
            feature: entry.slug,
          });
          continue;
        }
        choices[element.rollOptionPrefix] = chosen;
        if (!element.choices.some((c) => c.value === chosen)) {
          warnings.push({
            kind: 'choice-not-offered',
            choice: element.rollOptionPrefix,
            value: chosen,
          });
        }
        if (element.grantsFromPackId !== undefined) {
          const granted = inputs.resolve(element.grantsFromPackId, chosen);
          if (granted === undefined) {
            warnings.push({
              kind: 'missing-entry',
              packId: element.grantsFromPackId,
              slug: chosen,
            });
          } else {
            add(granted, depth + 1);
          }
        }
      }
    }
  };

  for (const source of [
    inputs.ancestry,
    inputs.heritage,
    inputs.background,
    inputs.class,
  ]) {
    for (const element of source?.ruleElements ?? []) {
      if (element.kind === 'grantItem') {
        const granted = inputs.resolve(element.packId, element.slug);
        if (granted === undefined) {
          warnings.push({
            kind: 'missing-entry',
            packId: element.packId,
            slug: element.slug,
          });
        } else {
          add(granted, 1);
        }
      }
    }
  }

  // A tagged feature is one alternative of a choice, granted only by making it.
  for (const feature of [...(inputs.classFeatures ?? [])]
    .filter((f) => f.level <= level && f.tags.length === 0)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))) {
    add(feature, 0);
  }

  const slots = featSlotsUpTo(level, inputs.class?.advancement);
  for (const pick of [...build.feats].sort((a, b) => a.level - b.level)) {
    if (pick.level > level) {
      continue;
    }
    if (!slots.some((s) => s.slot === pick.slot && s.level === pick.level)) {
      warnings.push({
        kind: 'feat-slot-not-available',
        slot: pick.slot,
        level: pick.level,
      });
    }
    const entry = inputs.resolve(pick.feat.packId, pick.feat.slug);
    if (entry === undefined) {
      warnings.push({
        kind: 'missing-entry',
        packId: pick.feat.packId,
        slug: pick.feat.slug,
      });
    } else {
      add(entry, 0);
    }
  }

  const casting = deriveSpellcasting(inputs.class, level, keyAttribute);
  warnings.push(...casting.warnings);

  // Spell picks: granted as items, and handed back for the class entry's lists.
  const pickSpells = (picks: readonly { packId: string; slug: string }[]) =>
    picks.flatMap((pick) => {
      const entry = inputs.resolve(pick.packId, pick.slug);
      if (entry === undefined) {
        warnings.push({ kind: 'missing-entry', packId: pick.packId, slug: pick.slug });
        return [];
      }
      if (entry.kind !== 'spell') {
        warnings.push({ kind: 'not-a-spell', packId: pick.packId, slug: pick.slug });
        return [];
      }
      add(entry, MAX_GRANT_DEPTH);
      return [{ packId: entry.packId, slug: entry.slug }];
    });
  const spellPicks = {
    cantrips: pickSpells(build.spells.cantrips),
    ranked: pickSpells(build.spells.ranked),
  };
  const allowedCantrips = casting.spellcasting?.cantrips;
  if (allowedCantrips !== undefined && build.spells.cantrips.length > allowedCantrips) {
    warnings.push({
      kind: 'too-many-cantrips',
      chosen: build.spells.cantrips.length,
      allowed: allowedCantrips,
    });
  }

  return {
    level,
    attributes: boosts.attributes,
    keyAttribute,
    ranks: { ...base, skills },
    ancestryHp: inputs.ancestry?.hp ?? 0,
    classHp: inputs.class?.hpPerLevel ?? 0,
    speed: inputs.ancestry?.speed ?? 25,
    items,
    choices,
    spellcasting: casting.spellcasting,
    spellPicks,
    warnings,
  };
}
