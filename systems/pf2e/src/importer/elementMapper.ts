/**
 * Maps one upstream Foundry rule element onto ADR 0004's v1 subset. This
 * module, `mapPredicate.ts`, and nothing else, are where Foundry's
 * rule-element format is known to exist at all -- the mapping layer ADR
 * 0004 decision 3 requires.
 *
 * **`GrantItem` is special**: its `uuid` names another upstream document,
 * and resolving that to one of *our* compendium entries (a `{ packId,
 * slug }` pair) needs the full imported entry set, which a single-element
 * mapper doesn't have. This stage produces an `UnresolvedGrantItem`
 * carrying the raw `uuid`; the dependency-resolution pass (a later PR)
 * finishes the job, turning it into `@hearthtable/core`'s real
 * `GrantItemElement` or dropping the entry whole if the target was
 * excluded (ADR 0003 decision 5).
 *
 * **A known v1 gap, not silently worked around:** `grantItemElementSchema`
 * and `choiceSetElementSchema` have no `predicate` field in
 * `@hearthtable/core` -- neither kind was expected to need conditional
 * application when that schema was designed. Real upstream data can
 * predicate both. Rather than silently dropping the predicate (which would
 * turn a conditional grant or choice into an unconditional one -- a wrong
 * answer, not a missing one), a predicated `GrantItem` or `ChoiceSet` maps
 * to `inert` instead. If the coverage report (a later PR) shows this is
 * common, that is the evidence to add the field, not a guess made here.
 */

import type {
  ChoiceOption,
  ChoiceSetElement,
  DamageDiceElement,
  FlatModifierElement,
  InertRuleElement,
  ModifierType,
  RollOptionElement,
} from '@hearthtable/core';
import { MODIFIER_TYPES } from '@hearthtable/core';

import { mapPredicateArray } from './mapPredicate.js';

export interface UnresolvedGrantItem {
  readonly kind: 'unresolvedGrantItem';
  readonly uuid: string;
}

/**
 * Everything one call to `mapRuleElement` can produce. `grantItem` (the
 * core, resolved shape) never appears here -- see the module doc.
 * `choiceSet` needs no equivalent "unresolved" variant: once a predicated
 * `ChoiceSet` has already gone inert (the module doc's known gap), what
 * remains has no cross-entry reference left to resolve, so it maps straight
 * to `@hearthtable/core`'s `ChoiceSetElement`.
 */
export type MappedElement =
  | FlatModifierElement
  | DamageDiceElement
  | RollOptionElement
  | ChoiceSetElement
  | UnresolvedGrantItem
  | InertRuleElement;

const DIE_SIZE_TO_FACES: Record<string, 4 | 6 | 8 | 10 | 12> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
};

function inert(upstreamKind: string, reason: string): InertRuleElement {
  return { kind: 'inert', upstreamKind, reason };
}

function isModifierType(value: string): value is ModifierType {
  return (MODIFIER_TYPES as readonly string[]).includes(value);
}

function mapFlatModifier(record: Record<string, unknown>): MappedElement {
  const { selector, type, value } = record;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return inert(
      'FlatModifier',
      typeof value === 'string' ? 'formula-value' : 'unsupported-shape',
    );
  }
  if (typeof selector !== 'string' || selector.length === 0) {
    return inert('FlatModifier', 'unsupported-shape');
  }
  if (typeof type !== 'string' || !isModifierType(type)) {
    return inert('FlatModifier', 'unsupported-modifier-type');
  }
  const predicateResult = mapPredicateArray(record.predicate);
  if (!predicateResult.ok) {
    return inert('FlatModifier', 'unsupported-predicate');
  }

  const label = record.label ?? record.slug;
  const slug = record.slug;

  return {
    kind: 'flatModifier',
    selector,
    ...(typeof slug === 'string' ? { slug } : {}),
    label: typeof label === 'string' && label.length > 0 ? label : selector,
    type,
    value,
    ...(predicateResult.predicate !== undefined
      ? { predicate: predicateResult.predicate }
      : {}),
  };
}

function mapDamageDice(record: Record<string, unknown>): MappedElement {
  const { selector, diceNumber, dieSize, damageType } = record;
  if (
    typeof diceNumber !== 'number' ||
    !Number.isInteger(diceNumber) ||
    diceNumber <= 0
  ) {
    return inert(
      'DamageDice',
      typeof diceNumber === 'string' ? 'formula-value' : 'unsupported-shape',
    );
  }
  if (typeof selector !== 'string' || selector.length === 0) {
    return inert('DamageDice', 'unsupported-shape');
  }
  if (typeof dieSize !== 'string' || !(dieSize in DIE_SIZE_TO_FACES)) {
    return inert('DamageDice', 'unsupported-die-size');
  }
  const predicateResult = mapPredicateArray(record.predicate);
  if (!predicateResult.ok) {
    return inert('DamageDice', 'unsupported-predicate');
  }

  return {
    kind: 'damageDice',
    selector,
    diceNumber,
    dieFaces: DIE_SIZE_TO_FACES[dieSize]!,
    ...(typeof damageType === 'string' ? { damageType } : {}),
    ...(predicateResult.predicate !== undefined
      ? { predicate: predicateResult.predicate }
      : {}),
  };
}

function mapRollOption(record: Record<string, unknown>): MappedElement {
  const { option } = record;
  if (typeof option !== 'string' || option.length === 0) {
    return inert('RollOption', 'unsupported-shape');
  }
  const predicateResult = mapPredicateArray(record.predicate);
  if (!predicateResult.ok) {
    return inert('RollOption', 'unsupported-predicate');
  }

  return {
    kind: 'rollOption',
    option,
    ...(predicateResult.predicate !== undefined
      ? { predicate: predicateResult.predicate }
      : {}),
  };
}

function mapGrantItem(record: Record<string, unknown>): MappedElement {
  const { uuid } = record;
  if (typeof uuid !== 'string' || uuid.length === 0) {
    return inert('GrantItem', 'unsupported-shape');
  }
  // grantItemElementSchema has no predicate field -- see the module doc.
  if (record.predicate !== undefined) {
    return inert('GrantItem', 'predicate-unsupported-on-grant-item');
  }

  return { kind: 'unresolvedGrantItem', uuid };
}

function mapChoiceSet(record: Record<string, unknown>): MappedElement {
  const { prompt, choices, rollOption } = record;
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return inert('ChoiceSet', 'unsupported-shape');
  }
  if (typeof rollOption !== 'string' || rollOption.length === 0) {
    return inert('ChoiceSet', 'missing-roll-option-prefix');
  }
  // choiceSetElementSchema has no predicate field -- see the module doc.
  if (record.predicate !== undefined) {
    return inert('ChoiceSet', 'predicate-unsupported-on-choice-set');
  }
  if (!Array.isArray(choices) || choices.length === 0) {
    // Upstream also supports choices drawn from a UUID list or a
    // compendium browser query -- neither is an inline array, and neither
    // is in v1's subset.
    return inert('ChoiceSet', 'non-inline-choices');
  }

  const mappedChoices: ChoiceOption[] = [];
  for (const choice of choices) {
    if (typeof choice !== 'object' || choice === null) {
      return inert('ChoiceSet', 'unsupported-choice-shape');
    }
    const { value, label } = choice as Record<string, unknown>;
    if (typeof value !== 'string' || typeof label !== 'string') {
      return inert('ChoiceSet', 'unsupported-choice-shape');
    }
    mappedChoices.push({ value, label });
  }

  return {
    kind: 'choiceSet',
    prompt,
    choices: mappedChoices,
    rollOptionPrefix: rollOption,
  };
}

/**
 * Maps one upstream rule element (an entry from an item's `system.rules`
 * array) onto the v1 subset, or to `inert` if it can't be represented.
 */
export function mapRuleElement(raw: unknown): MappedElement {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return inert('unknown', 'malformed-rule-element');
  }
  const record = raw as Record<string, unknown>;
  const upstreamKind = typeof record.key === 'string' ? record.key : 'unknown';

  switch (upstreamKind) {
    case 'FlatModifier':
      return mapFlatModifier(record);
    case 'DamageDice':
      return mapDamageDice(record);
    case 'RollOption':
      return mapRollOption(record);
    case 'GrantItem':
      return mapGrantItem(record);
    case 'ChoiceSet':
      return mapChoiceSet(record);
    default:
      return inert(upstreamKind, 'unmapped-element-kind');
  }
}
