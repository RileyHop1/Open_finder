/**
 * The turn order, derived and never stored (ADR 0018, decision 3): sort the
 * combatants by initiative, break ties, and step from one turn to the next. Pure
 * functions over plain entries, so the server's turn operation, the tracker
 * panel, and the tests all share one answer to "who goes next".
 *
 * **Tie rule (`docs/rulings.md`, "Initiative ties"):** a player character goes
 * before a monster with the same initiative. Past that, the one who joined the
 * combat first goes first, then the id, so the order is the same on every screen
 * and never depends on the order a list happened to arrive in.
 *
 * An **unrolled** combatant sorts after every rolled one and is not in the turn
 * order until it rolls (or the GM sets a number). A **defeated** one stays where
 * it sorts, so the GM sees it in place, but turns skip it.
 */

/** What the order needs to know about one combatant. The server builds these from a `Combatant` and its actor. */
export interface InitiativeEntry {
  readonly id: string;
  /** Absent until rolled or set. */
  readonly initiative: number | undefined;
  readonly defeated: boolean;
  /** A player character, as opposed to a monster, hazard, or other NPC: it wins a tie. */
  readonly isCharacter: boolean;
  /** When the combatant joined, as an ISO timestamp: the next tie-break. */
  readonly createdAt: string;
}

function compare(a: InitiativeEntry, b: InitiativeEntry): number {
  if (a.initiative !== b.initiative) {
    if (a.initiative === undefined) {
      return 1;
    }
    if (b.initiative === undefined) {
      return -1;
    }
    return b.initiative - a.initiative;
  }
  if (a.isCharacter !== b.isCharacter) {
    return a.isCharacter ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every combatant in initiative order, highest first, ties broken as above,
 * unrolled last. Defeated combatants are kept in place. Returns a new array.
 */
export function sortByInitiative<T extends InitiativeEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(compare);
}

/** Whether a combatant takes turns: it has an initiative and is still in the fight. */
export function takesTurns(entry: InitiativeEntry): boolean {
  return entry.initiative !== undefined && !entry.defeated;
}

/** The result of stepping the turn: who is next, and whether the step went past the end (or start) of the order. */
export interface TurnStep<T> {
  /** Undefined when nobody takes a turn. */
  readonly combatant: T | undefined;
  /** Going forward: a new round begins. Going back: the previous round. */
  readonly wrapped: boolean;
}

/**
 * Steps through `sorted` (from `sortByInitiative`) by `direction`, skipping
 * anyone who does not take turns.
 *
 * With no active combatant (the combat is starting), forward gives the first
 * who takes a turn and **counts as wrapping**: it is the start of round 1.
 * Backward from nothing gives nobody. `activeId` should name a combatant still
 * in `sorted`; one that is not is treated as none, so the server steps before it
 * removes a combatant, not after.
 */
function step<T extends InitiativeEntry>(
  sorted: readonly T[],
  activeId: string | undefined,
  direction: 1 | -1,
): TurnStep<T> {
  const start = activeId === undefined ? -1 : sorted.findIndex((e) => e.id === activeId);
  if (start === -1) {
    if (direction === -1) {
      return { combatant: undefined, wrapped: false };
    }
    return { combatant: sorted.find(takesTurns), wrapped: true };
  }
  for (let offset = 1; offset <= sorted.length; offset += 1) {
    const raw = start + direction * offset;
    const index = ((raw % sorted.length) + sorted.length) % sorted.length;
    const candidate = sorted[index];
    if (candidate !== undefined && takesTurns(candidate)) {
      return { combatant: candidate, wrapped: raw < 0 || raw >= sorted.length };
    }
  }
  return { combatant: undefined, wrapped: false };
}

/** The combatant whose turn comes after `activeId`'s. See `step`. */
export function nextCombatant<T extends InitiativeEntry>(
  sorted: readonly T[],
  activeId: string | undefined,
): TurnStep<T> {
  return step(sorted, activeId, 1);
}

/** The combatant whose turn came before `activeId`'s: the GM's "previous turn". See `step`. */
export function previousCombatant<T extends InitiativeEntry>(
  sorted: readonly T[],
  activeId: string | undefined,
): TurnStep<T> {
  return step(sorted, activeId, -1);
}
