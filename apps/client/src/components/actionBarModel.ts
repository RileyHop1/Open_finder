/**
 * What the action bar shows for the selected token's actor: its strikes, each
 * with the three Multiple Attack Penalty variants precomputed (the same
 * numbers `StrikesPanel.vue` already shows, from `prepareCharacter`/
 * `prepareNpc`), and the hand-picked basic actions (`BASIC_ACTIONS`). Kept
 * apart from the component so the strike-variant math is testable without
 * mounting anything.
 *
 * `canAct` says whether there is a combatant to spend actions against: a
 * strike still rolls without one (as `StrikesPanel` always has), it just
 * costs nothing, and the basic actions -- which only ever spend, never roll
 * -- have nothing to do.
 */

import type { Actor, Combatant } from '@hearthtable/core';
import type { Statistic } from '@hearthtable/core';
import {
  BASIC_ACTIONS,
  characterDataSchema,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
  type BasicAction,
} from '@hearthtable/pf2e';

const ATTACK_LABELS = ['1st', '2nd', '3rd'] as const;

export interface ActionBarAttack {
  readonly label: (typeof ATTACK_LABELS)[number];
  readonly attackNumber: 1 | 2 | 3;
  readonly total: number;
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
  readonly basics: readonly BasicAction[];
  readonly canAct: boolean;
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
      { label: ATTACK_LABELS[0], attackNumber: 1, total: first.total },
      { label: ATTACK_LABELS[1], attackNumber: 2, total: second.total },
      { label: ATTACK_LABELS[2], attackNumber: 3, total: third.total },
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
    basics: BASIC_ACTIONS,
    canAct: combatant !== undefined,
  };
}
