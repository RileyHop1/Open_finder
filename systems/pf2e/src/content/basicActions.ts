/**
 * The action bar's basic-action entries: common activities every creature
 * can take, independent of class or feat. Hand-picked, not imported -- a
 * short, obviously-correct list beats waiting on full action-compendium
 * wiring in the UI (`docs/rulings.md`, "The basic-action bar's list is
 * hand-picked"). Each spends its cost via `combat.spendAction` and rolls
 * nothing. Delay is a free action (it costs nothing, and removes the
 * combatant from the turn order rather than spending from it); Ready costs
 * two actions (prepare the triggered action, then it resolves as a reaction
 * later). Every other entry here is a single action.
 */

export interface BasicAction {
  readonly slug: string;
  readonly name: string;
  readonly cost: 0 | 1 | 2;
}

export const BASIC_ACTIONS: readonly BasicAction[] = [
  { slug: 'stride', name: 'Stride', cost: 1 },
  { slug: 'step', name: 'Step', cost: 1 },
  { slug: 'interact', name: 'Interact', cost: 1 },
  { slug: 'delay', name: 'Delay', cost: 0 },
  { slug: 'ready', name: 'Ready', cost: 2 },
  { slug: 'take-cover', name: 'Take Cover', cost: 1 },
  { slug: 'seek', name: 'Seek', cost: 1 },
];
