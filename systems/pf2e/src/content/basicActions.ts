/**
 * The action bar's basic-action entries: common one-action activities every
 * creature can take, independent of class or feat. Hand-picked, not imported
 * -- the importer has no compendium source for these yet (`docs/rulings.md`,
 * "The basic-action bar's list is hand-picked"). Each spends its cost via
 * `combat.spendAction` and rolls nothing.
 */

export interface BasicAction {
  readonly slug: string;
  readonly name: string;
  readonly cost: 1;
}

export const BASIC_ACTIONS: readonly BasicAction[] = [
  { slug: 'stride', name: 'Stride', cost: 1 },
  { slug: 'step', name: 'Step', cost: 1 },
  { slug: 'interact', name: 'Interact', cost: 1 },
  { slug: 'delay', name: 'Delay', cost: 1 },
  { slug: 'ready', name: 'Ready', cost: 1 },
  { slug: 'take-cover', name: 'Take Cover', cost: 1 },
  { slug: 'seek', name: 'Seek', cost: 1 },
];
