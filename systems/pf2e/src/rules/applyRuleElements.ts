/**
 * Applies an actor's items' rule elements: resolves which roll options are
 * active, and groups `flatModifier`/`damageDice` elements by `selector` so
 * a caller can feed them straight into `resolveStatistic`
 * (`buildArmorClass`, `buildSave`, ...) or `buildStrikeDamage`'s
 * `extraComponents`. This is what makes ADR 0004's five-element subset
 * load-bearing rather than decorative -- see `docs/rule-elements.md`'s
 * "Applying rule elements" section, which names this module's job exactly.
 *
 * **`flatModifier` and `damageDice` treat predicates differently, and that
 * is deliberate, not an inconsistency:** a `Modifier` (`packages/core`) has
 * its own `predicate` field, evaluated later by `resolveStatistic` at
 * resolution time (ADR 0008 decision 6) -- so a `flatModifier` element's
 * predicate is carried through onto the `Modifier` unevaluated here.
 * `DamageComponent` (`@hearthtable/dice`) has no predicate field at all --
 * it is a system-agnostic package with no notion of PF2e's roll options --
 * so a `damageDice` element's predicate has nowhere later to be evaluated,
 * and must be resolved eagerly, right here, against the final roll option
 * set.
 *
 * **`grantItem` is out of scope here.** Granting another compendium entry
 * onto a character is character-build state (milestone 7's wizard), not
 * something resolved every time a statistic is computed.
 */

import type { DamageDiceElement, Modifier, RuleElement } from '@hearthtable/core';
import { testPredicate } from '@hearthtable/core';

/** An actor's item, reduced to what this module needs: a display name for `Modifier.source`, and the rule elements it carries. */
export interface RuleElementSource {
  readonly name: string;
  readonly ruleElements: readonly RuleElement[];
}

export interface ApplyRuleElementsOptions {
  readonly items: readonly RuleElementSource[];
  /** Roll options already active from outside this item set -- traits, conditions, combat state. */
  readonly rollOptions?: ReadonlySet<string>;
  /**
   * A `choiceSet` element's already-made choice, keyed by
   * `rollOptionPrefix`. Which choice a player made is character-build
   * state (milestone 7), not something this module decides -- an entry
   * here is only honored if a `choiceSet` element with that prefix is
   * actually present among `items` and lists the chosen value among its
   * own `choices`; anything else is silently ignored rather than adding an
   * unearned roll option.
   */
  readonly choices?: ReadonlyMap<string, string>;
}

export interface AppliedRuleElements {
  /** `options.rollOptions`, plus every `choiceSet` selection and every `rollOption` element whose predicate passed. */
  readonly rollOptions: ReadonlySet<string>;
  readonly modifiersBySelector: ReadonlyMap<string, readonly Modifier[]>;
  readonly damageDiceBySelector: ReadonlyMap<string, readonly DamageDiceElement[]>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolves the active roll option set: `choiceSet` selections first (they
 * never depend on another roll option), then `rollOption` elements as a
 * fixed-point loop -- one `rollOption`'s predicate can name another
 * `rollOption`'s output, the same reason `resolveDependencies.ts` sweeps
 * its drop graph to a fixed point rather than a single pass.
 */
function resolveRollOptions(
  items: readonly RuleElementSource[],
  baseRollOptions: ReadonlySet<string>,
  choices: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const rollOptions = new Set(baseRollOptions);

  for (const item of items) {
    for (const element of item.ruleElements) {
      if (element.kind !== 'choiceSet') {
        continue;
      }
      const chosen = choices.get(element.rollOptionPrefix);
      if (
        chosen !== undefined &&
        element.choices.some((choice) => choice.value === chosen)
      ) {
        rollOptions.add(`${element.rollOptionPrefix}:${chosen}`);
      }
    }
  }

  let addedThisPass = true;
  while (addedThisPass) {
    addedThisPass = false;
    for (const item of items) {
      for (const element of item.ruleElements) {
        if (element.kind !== 'rollOption' || rollOptions.has(element.option)) {
          continue;
        }
        if (
          element.predicate === undefined ||
          testPredicate(element.predicate, rollOptions)
        ) {
          rollOptions.add(element.option);
          addedThisPass = true;
        }
      }
    }
  }

  return rollOptions;
}

/** Groups every `flatModifier` element by `selector`, carrying each one's own `predicate` through onto the resulting `Modifier` unevaluated. */
function collectModifiers(
  items: readonly RuleElementSource[],
): ReadonlyMap<string, readonly Modifier[]> {
  const bySelector = new Map<string, Modifier[]>();

  for (const item of items) {
    item.ruleElements.forEach((element, index) => {
      if (element.kind !== 'flatModifier') {
        return;
      }
      const modifier: Modifier = {
        slug: element.slug ?? `${slugify(item.name)}-${index}`,
        label: element.label,
        type: element.type,
        value: element.value,
        source: item.name,
        enabled: true,
        ...(element.predicate === undefined ? {} : { predicate: element.predicate }),
      };
      const existing = bySelector.get(element.selector) ?? [];
      bySelector.set(element.selector, [...existing, modifier]);
    });
  }

  return bySelector;
}

/** Groups every `damageDice` element by `selector`, dropping any whose predicate fails against `rollOptions` -- `DamageComponent` has no predicate field to defer this to. */
function collectDamageDice(
  items: readonly RuleElementSource[],
  rollOptions: ReadonlySet<string>,
): ReadonlyMap<string, readonly DamageDiceElement[]> {
  const bySelector = new Map<string, DamageDiceElement[]>();

  for (const item of items) {
    for (const element of item.ruleElements) {
      if (element.kind !== 'damageDice') {
        continue;
      }
      if (
        element.predicate !== undefined &&
        !testPredicate(element.predicate, rollOptions)
      ) {
        continue;
      }
      const existing = bySelector.get(element.selector) ?? [];
      bySelector.set(element.selector, [...existing, element]);
    }
  }

  return bySelector;
}

/**
 * Walks every item's rule elements once, resolving roll options and
 * grouping `flatModifier`/`damageDice` elements by `selector`. See the
 * module doc for why the two kinds' predicates are handled differently.
 */
export function applyRuleElements(
  options: ApplyRuleElementsOptions,
): AppliedRuleElements {
  const rollOptions = resolveRollOptions(
    options.items,
    options.rollOptions ?? new Set(),
    options.choices ?? new Map(),
  );

  return {
    rollOptions,
    modifiersBySelector: collectModifiers(options.items),
    damageDiceBySelector: collectDamageDice(options.items, rollOptions),
  };
}
