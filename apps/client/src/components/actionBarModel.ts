/**
 * What the action bar shows for the selected token's actor: its strikes, each
 * with the three Multiple Attack Penalty variants precomputed (the same
 * numbers `StrikesPanel.vue` already shows, from `prepareCharacter`/
 * `prepareNpc`). Kept apart from the component so the strike-variant math is
 * testable without mounting anything. Everything that is not a strike goes
 * through the generic action form (ADR 0023), which has no data of its own.
 *
 * `canAct` says whether there is a combatant to spend actions against: a
 * strike still rolls without one (as `StrikesPanel` always has), it just
 * costs nothing, and the generic action's cost picker has nothing to spend.
 */

import type {
  Actor,
  Combatant,
  RollModifier,
  SituationalModifier,
} from '@hearthtable/core';
import type { Statistic } from '@hearthtable/core';
import {
  characterDataSchema,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
} from '@hearthtable/pf2e';

const ATTACK_LABELS = ['1st', '2nd', '3rd'] as const;

export interface ActionBarAttack {
  readonly label: (typeof ATTACK_LABELS)[number];
  readonly attackNumber: 1 | 2 | 3;
  readonly total: number;
  /** The same `Statistic` `total` was read from, for this attack's own `StatBreakdown` (milestone 6). */
  readonly statistic: Statistic;
}

export interface ActionBarStrike {
  readonly name: string;
  /** Names the roll the way `actor.rollStrike` expects it. */
  readonly target: { readonly itemId: string } | { readonly strikeKey: string };
  readonly attacks: readonly [ActionBarAttack, ActionBarAttack, ActionBarAttack];
  readonly ranged: boolean;
  /** Melee only: whether the weapon's `reach` trait adds 5 feet to the highlight. */
  readonly reach: boolean;
  /** Ranged only: the weapon's range in feet, for the highlight. Undefined when unknown (an NPC's strike -- no weapon entry to read it from). */
  readonly rangeFeet: number | undefined;
  /** The weapon's or creature strike's own traits, for `RulesTerm` tooltips on the action bar (milestone 6). */
  readonly traits: readonly string[];
}

export interface ActionBarView {
  readonly strikes: readonly ActionBarStrike[];
  readonly canAct: boolean;
}

/** What a generic action costs: nothing, a reaction, or 1 to 3 actions. */
export type GenericActionCost = 'free' | 'reaction' | 1 | 2 | 3;

/**
 * The generic action form's submission (ADR 0023): anything the system does
 * not model, described by the player. `dice` is raw text for the server to
 * roll (empty for none). Situational modifiers are not part of it: the table
 * adds the player's switched-on ones to the dice.
 */
export interface GenericAction {
  readonly text: string;
  readonly cost: GenericActionCost;
  readonly dice: string;
}

/** The sum of the modifiers that are switched on. */
export function modifierSum(modifiers: readonly SituationalModifier[]): number {
  return modifiers.reduce((sum, m) => (m.active ? sum + m.value : sum), 0);
}

/** What a roll carries: the switched-on modifiers, without their on/off flag. */
export function activeModifiers(
  modifiers: readonly SituationalModifier[] | undefined,
): RollModifier[] {
  return (modifiers ?? [])
    .filter((m) => m.active)
    .map((m) => ({
      value: m.value,
      ...(m.label === undefined ? {} : { label: m.label }),
    }));
}

/** PF2e traits are sometimes a compound slug (`deadly-d10`): a plain trait never has a dash-number tail. */
function hasTrait(traits: readonly string[], trait: string): boolean {
  return traits.some((t) => t === trait || t.startsWith(`${trait}-`));
}

function toBarStrike(
  target: ActionBarStrike['target'],
  name: string,
  attacks: readonly [Statistic, Statistic, Statistic],
  extra: Pick<ActionBarStrike, 'ranged' | 'reach' | 'rangeFeet' | 'traits'>,
): ActionBarStrike {
  const [first, second, third] = attacks;
  return {
    target,
    name,
    attacks: [
      { label: ATTACK_LABELS[0], attackNumber: 1, total: first.total, statistic: first },
      {
        label: ATTACK_LABELS[1],
        attackNumber: 2,
        total: second.total,
        statistic: second,
      },
      { label: ATTACK_LABELS[2], attackNumber: 3, total: third.total, statistic: third },
    ],
    ...extra,
  };
}

function strikesOf(actor: Actor): ActionBarStrike[] {
  if (actor.kind === 'npc') {
    const parsed = npcDataSchema.safeParse(actor.system);
    if (!parsed.success) {
      return [];
    }
    // `prepareNpc`'s own output carries no traits (it's rules math, not
    // display), so they're read from the raw creature data it was built
    // from instead -- `creature.strikes.map(...)` inside `prepareNpc`
    // preserves order, so the same index names the same strike.
    const rawStrikes = parsed.data.creature.strikes;
    return prepareNpc(parsed.data).strikes.map((strike, index) =>
      toBarStrike({ strikeKey: strike.key }, strike.name, strike.attacks, {
        ranged: strike.ranged,
        reach: false,
        rangeFeet: undefined,
        traits: rawStrikes[index]?.traits ?? [],
      }),
    );
  }
  const parsed = characterDataSchema.safeParse(actor.system);
  return parsed.success
    ? prepareCharacter(parsed.data).strikes.map((strike) => {
        const weapon = strike.attackInputs.weapon;
        return toBarStrike({ itemId: strike.itemId }, strike.name, strike.attacks, {
          ranged: weapon.range !== undefined,
          reach: hasTrait(weapon.traits, 'reach'),
          rangeFeet: weapon.range,
          traits: weapon.traits,
        });
      })
    : [];
}

export function actionBarView(
  actor: Actor,
  combatant: Combatant | undefined,
): ActionBarView {
  return {
    strikes: strikesOf(actor),
    canAct: combatant !== undefined,
  };
}
