/**
 * Strike damage: maps a weapon entry and its `deadly`/`fatal` traits onto
 * `@hearthtable/dice`'s generic `DamageComponent[]`/`DamageDoubling`
 * vocabulary, per `packages/dice/src/damage.ts`'s module doc -- that module
 * stays system-agnostic on purpose, so this is the PF2e-specific caller it
 * describes.
 *
 * **Striking runes are character-equipment state, not compendium data.**
 * `WeaponEntry` describes a weapon *type* ("Longsword"), not a specific
 * instance a character owns, so it carries no rune fields -- the same gap
 * `strike.ts`'s attack roll hit for a weapon's potency item bonus. The
 * caller resolves `strikingDice` and passes it in.
 *
 * **Splash damage is not modeled here.** `WeaponEntry`'s `damage` field has
 * no splash-amount field to read (Stack B never added one), so a
 * `splash`-trait weapon's splash component has nothing to derive it from.
 * A caller that knows a specific splash amount supplies it directly via
 * `extraComponents`, tagged `doubling: 'neverDoubled'`, per
 * `packages/dice/src/damage.ts`'s doc.
 */

import type {
  DamageComponent,
  EvaluateDamageResult,
  RandomSource,
} from '@hearthtable/dice/pure';
import { evaluateDamage } from '@hearthtable/dice/pure';

import type { WeaponEntry } from '../content/weapon.js';

/**
 * Reads a trait like `deadly-d8` or `fatal-d10` and returns the die size it
 * names, or `undefined` if the weapon has no trait with that prefix.
 */
export function traitDieFaces(
  traits: readonly string[],
  prefix: 'deadly' | 'fatal',
): number | undefined {
  const pattern = new RegExp(`^${prefix}-d(\\d+)$`);
  for (const trait of traits) {
    const match = pattern.exec(trait);
    if (match?.[1] !== undefined) {
      return Number(match[1]);
    }
  }
  return undefined;
}

/** `"NdF+M"` / `"NdF-M"` / `"NdF"` -- never a `+0` or `-0` term nobody asked for. */
export function diceExpression(
  diceNumber: number,
  dieFaces: number,
  modifier: number,
): string {
  const dice = `${diceNumber}d${dieFaces}`;
  if (modifier === 0) {
    return dice;
  }
  return modifier > 0 ? `${dice}+${modifier}` : `${dice}${modifier}`;
}

export interface BuildStrikeDamageOptions {
  readonly weapon: WeaponEntry;
  /**
   * Extra weapon damage dice from a striking rune: `0` for none, `1` for a
   * plain striking rune, `2` for greater striking, `3` for major striking.
   * Character-equipment state, resolved by the caller.
   */
  readonly strikingDice: 0 | 1 | 2 | 3;
  /** The already-resolved ability modifier this strike's damage uses -- the caller decides which ability and whether it applies in full, same as `buildStrikeAttack`'s `attackAttribute`. */
  readonly abilityModifier: number;
  /** Whether this damage roll follows a critical hit -- `fatal`'s die-size swap only applies on a crit. */
  readonly critical: boolean;
  /** A rune's extra elemental damage, a rogue's sneak attack dice, a caller-supplied splash component, and so on. */
  readonly extraComponents?: readonly DamageComponent[];
}

/**
 * Assembles this strike's damage components: the weapon's own dice (base
 * `damage.diceNumber` plus `strikingDice`, at `damage.dieFaces` -- or, on a
 * critical hit with the `fatal` trait, one extra die at `fatal`'s own,
 * larger die size instead) plus the ability modifier, then `deadly`'s
 * critical-only extra die if the weapon has that trait, then
 * `extraComponents`.
 *
 * `deadly`'s die count scales with striking runes, but not the way it looks
 * at first glance: a plain striking rune does **not** add a second deadly
 * die -- only greater striking (2 dice) and major striking (3 dice) do.
 * Confirmed against Archives of Nethys; see `packages/dice/src/damage.ts`'s
 * module doc.
 */
export function buildStrikeDamage(
  options: BuildStrikeDamageOptions,
): readonly DamageComponent[] {
  const traits = options.weapon.traits;
  const baseDiceNumber = options.weapon.damage.diceNumber + options.strikingDice;
  const fatalFaces = traitDieFaces(traits, 'fatal');
  const deadlyFaces = traitDieFaces(traits, 'deadly');

  const weaponComponent: DamageComponent =
    options.critical && fatalFaces !== undefined
      ? {
          expression: diceExpression(
            baseDiceNumber + 1,
            fatalFaces,
            options.abilityModifier,
          ),
          damageType: options.weapon.damage.damageType,
        }
      : {
          expression: diceExpression(
            baseDiceNumber,
            options.weapon.damage.dieFaces,
            options.abilityModifier,
          ),
          damageType: options.weapon.damage.damageType,
        };

  const deadlyComponent: DamageComponent | undefined =
    deadlyFaces === undefined
      ? undefined
      : {
          expression: diceExpression(
            options.strikingDice <= 1 ? 1 : options.strikingDice,
            deadlyFaces,
            0,
          ),
          damageType: options.weapon.damage.damageType,
          doubling: 'criticalOnly',
        };

  return [
    weaponComponent,
    ...(deadlyComponent === undefined ? [] : [deadlyComponent]),
    ...(options.extraComponents ?? []),
  ];
}

export interface RollStrikeDamageOptions extends BuildStrikeDamageOptions {
  /** Pass `cryptoRandomSource` in production; tests pass a seeded or scripted source. */
  readonly rng: RandomSource;
}

/**
 * Builds this strike's damage components via `buildStrikeDamage`, then
 * evaluates them through `@hearthtable/dice`'s `evaluateDamage` -- which
 * doubles the whole total on a critical hit, per-component doubling
 * behavior included, rather than doubling each component and re-summing.
 */
export function rollStrikeDamage(options: RollStrikeDamageOptions): EvaluateDamageResult {
  const components = buildStrikeDamage(options);
  return evaluateDamage(components, options.critical, { rng: options.rng });
}
