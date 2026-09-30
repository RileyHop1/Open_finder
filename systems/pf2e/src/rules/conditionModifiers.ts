/**
 * Turns an actor's applied conditions into `Modifier`s for one statistic --
 * the mapping `docs/conditions.md` and `content/condition.ts` left open. A
 * condition never edits a total; it contributes typed modifiers that
 * `resolveStatistic` stacks like any other (ADR 0008), so *frightened 2* and
 * *clumsy 1* on a Reflex save resolve to a single -2 status penalty with the
 * clumsy line shown as suppressed, not to -3.
 *
 * Asked per statistic (`ConditionTarget`) rather than returning one
 * pre-grouped map, because whether a condition applies often depends on the
 * statistic's attribute: *clumsy* hits every Dexterity-based roll and DC, and
 * which attribute a strike or a class DC uses is the caller's choice.
 *
 * Only conditions that change a number are handled here. Slowed, stunned,
 * quickened, and the dying chain change the action economy or need combat
 * state (milestone 5), and detection states change flat checks, not
 * modifiers; an unmodeled condition contributes nothing rather than a guess.
 * `docs/rulings.md` lists what is and is not covered.
 */

import type { Modifier } from '@hearthtable/core';

import type { AppliedCondition } from '../content/character.js';
import type { Attribute } from '../content/common.js';
import type { SaveType } from './defenses.js';
import { attributeForSkill } from './skills.js';

/** One statistic a condition may modify. */
export type ConditionTarget =
  | { readonly kind: 'ac' }
  | { readonly kind: 'save'; readonly save: SaveType }
  | { readonly kind: 'perception' }
  | { readonly kind: 'classDc'; readonly keyAttribute: Attribute }
  | { readonly kind: 'skill'; readonly skill: string }
  /** Any attack roll; `attribute` is the one this attack adds (a spell attack passes its casting attribute). */
  | { readonly kind: 'attack'; readonly attribute: Attribute }
  | { readonly kind: 'damage'; readonly attribute: Attribute }
  | { readonly kind: 'maxHp'; readonly level: number };

const SAVE_ATTRIBUTES: Readonly<Record<SaveType, Attribute>> = {
  fortitude: 'con',
  reflex: 'dex',
  will: 'wis',
};

/** The attribute a rolled or DC-style target is "based on", or `undefined` for one with none (damage and max HP are handled separately). */
function attributeOf(target: ConditionTarget): Attribute | undefined {
  switch (target.kind) {
    case 'ac':
      return 'dex';
    case 'save':
      return SAVE_ATTRIBUTES[target.save];
    case 'perception':
      return 'wis';
    case 'classDc':
      return target.keyAttribute;
    case 'skill':
      return attributeForSkill(target.skill);
    case 'attack':
      return target.attribute;
    case 'damage':
    case 'maxHp':
      return undefined;
  }
}

/** Valued conditions whose status penalty hits rolls and DCs based on certain attributes. `damage` marks the one that also hits damage rolls. */
const ATTRIBUTE_PENALTIES: Readonly<
  Record<string, { readonly attributes: readonly Attribute[]; readonly damage?: true }>
> = {
  clumsy: { attributes: ['dex'] },
  enfeebled: { attributes: ['str'], damage: true },
  stupefied: { attributes: ['int', 'wis', 'cha'] },
  drained: { attributes: ['con'] },
};

/** Valued conditions whose status penalty hits every check and DC. */
const ALL_CHECKS_AND_DCS: ReadonlySet<string> = new Set(['frightened', 'sickened']);

/** Conditions that carry the off-guard condition with them (Archives of Nethys, checked 2026-09-30). */
const IMPLIES_OFF_GUARD: ReadonlySet<string> = new Set([
  'prone',
  'restrained',
  'grabbed',
  'paralyzed',
  'confused',
  'unconscious',
]);

interface FlatPenalty {
  readonly type: 'status' | 'circumstance';
  readonly value: number;
  readonly applies: (target: ConditionTarget) => boolean;
}

/** Fixed penalties from binary conditions (numbers checked against Archives of Nethys, 2026-09-30). Unconscious also carries blinded, whose sight-dependent penalty is deliberately not applied; see `docs/rulings.md`. */
const FLAT_PENALTIES: Readonly<Record<string, FlatPenalty>> = {
  'off-guard': { type: 'circumstance', value: -2, applies: (t) => t.kind === 'ac' },
  prone: { type: 'circumstance', value: -2, applies: (t) => t.kind === 'attack' },
  fatigued: {
    type: 'status',
    value: -1,
    applies: (t) => t.kind === 'ac' || t.kind === 'save',
  },
  fascinated: {
    type: 'status',
    value: -2,
    applies: (t) => t.kind === 'perception' || t.kind === 'skill',
  },
  unconscious: {
    type: 'status',
    value: -4,
    applies: (t) =>
      t.kind === 'ac' ||
      t.kind === 'perception' ||
      (t.kind === 'save' && t.save === 'reflex'),
  },
};

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function modifier(
  slug: string,
  label: string,
  source: string,
  type: Modifier['type'],
  value: number,
): Modifier {
  return { slug, label, type, value, source, enabled: true };
}

/**
 * Every modifier `conditions` contribute to `target`. Order follows
 * `conditions`; stacking between them is `resolveStatistic`'s job. A valued
 * condition without a `value` is treated as value 1 -- the smallest the rules
 * allow -- rather than skipped, so a hand-applied condition never silently
 * does nothing.
 */
export function conditionModifiers(
  conditions: readonly AppliedCondition[],
  target: ConditionTarget,
): Modifier[] {
  const modifiers: Modifier[] = [];
  const attribute = attributeOf(target);

  for (const { slug, value } of conditions) {
    const name = titleCase(slug);
    const amount = value ?? 1;
    const valuedLabel = `${name} ${amount}`;

    const attributePenalty = ATTRIBUTE_PENALTIES[slug];
    if (attributePenalty !== undefined) {
      if (target.kind === 'maxHp') {
        if (slug === 'drained') {
          // Drained also lowers maximum HP by level x value. Not a bonus type, so untyped.
          modifiers.push(
            modifier(slug, valuedLabel, name, 'untyped', -amount * target.level),
          );
        }
      } else if (target.kind === 'damage') {
        if (attributePenalty.damage === true && target.attribute === 'str') {
          modifiers.push(modifier(slug, valuedLabel, name, 'status', -amount));
        }
      } else if (
        attribute !== undefined &&
        attributePenalty.attributes.includes(attribute)
      ) {
        modifiers.push(modifier(slug, valuedLabel, name, 'status', -amount));
      }
    }

    if (
      ALL_CHECKS_AND_DCS.has(slug) &&
      target.kind !== 'damage' &&
      target.kind !== 'maxHp'
    ) {
      modifiers.push(modifier(slug, valuedLabel, name, 'status', -amount));
    }

    const flat = FLAT_PENALTIES[slug];
    if (flat !== undefined && flat.applies(target)) {
      modifiers.push(modifier(slug, name, name, flat.type, flat.value));
    }

    if (IMPLIES_OFF_GUARD.has(slug)) {
      const offGuard = FLAT_PENALTIES['off-guard'];
      if (offGuard?.applies(target) === true) {
        modifiers.push(
          modifier(`off-guard:${slug}`, 'Off-guard', name, offGuard.type, offGuard.value),
        );
      }
    }
  }

  return modifiers;
}
