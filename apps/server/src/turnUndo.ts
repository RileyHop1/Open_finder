/**
 * Turn undo's bookkeeping (ADR 0019): which step of the current combat turn an
 * operation belongs to, and what every document it touched looked like before.
 *
 * A step opens when the active combatant's in-budget spend lands; everything
 * else that happens on that turn (a move, a reaction, the GM's damage, a
 * condition) joins the step that is open. Undoing a step later writes every
 * recorded document back as it was. Chat messages are never recorded: a roll
 * stays in chat, and the GM edits it instead of anyone undoing it.
 *
 * The stack belongs to one turn -- a combat, its active combatant, a round --
 * and is cleared the moment the turn it belongs to is no longer the one
 * running, so a turn change, the end of a combat, or its deletion all clear it
 * without any of those operations having to know undo exists.
 */

import {
  baseDocumentSchema,
  combatantSchema,
  combatSchema,
  type Combat,
} from '@hearthtable/core';
import type { BaseDocument, Seat } from '@hearthtable/core';

import { turnCapacityOf } from './combat.js';
import { OperationRejected } from './rejection.js';
import type { UndoStep, UndoTurn, WorldStore } from './worldStore.js';

/** Document types an undo never restores: a roll is never taken back (ADR 0019, decision 7). */
const NEVER_RECORDED = new Set(['chatMessage']);

/**
 * A `WorldStore` that behaves exactly like `store` and also records, in
 * `befores`, each document's raw stored state before its **first** write or
 * delete in this operation -- `null` for one the operation creates. Chat
 * messages are left out.
 */
export function recordTurnBefores(
  store: WorldStore,
  befores: Map<string, unknown>,
): WorldStore {
  const remember = (id: string): void => {
    if (befores.has(id)) {
      return;
    }
    const before = store.getDocument(id);
    befores.set(id, before === undefined ? null : before);
  };
  return {
    ...store,
    putDocument(document) {
      if (!NEVER_RECORDED.has(document.type)) {
        remember(document.id);
      }
      store.putDocument(document);
    },
    deleteDocument(id) {
      const type = (store.getDocument(id) as { type?: unknown } | undefined)?.type;
      if (typeof type !== 'string' || !NEVER_RECORDED.has(type)) {
        remember(id);
      }
      return store.deleteDocument(id);
    },
  };
}

/** What happened to the active combatant's spent actions in one operation. */
export interface SpendChange {
  before: number;
  after: number;
  capacity: number;
}

/** What to do with the stack after one operation. */
export type UndoDecision =
  | { kind: 'ignore' }
  | { kind: 'clear' }
  | { kind: 'open'; clearFirst: boolean; dropOldest: boolean }
  | { kind: 'append' };

function sameTurn(a: UndoTurn | undefined, b: UndoTurn | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.combatId === b.combatId &&
    a.combatantId === b.combatantId &&
    a.round === b.round
  );
}

/**
 * Where an operation's changes go, from the turn that was running before it,
 * the turn running after it, the steps already open, and how it changed the
 * active combatant's spent actions. Pure.
 *
 * - An operation that changes whose turn it is (or ends the combat) clears the
 *   stack and is never recorded: undo never reaches back across a turn.
 * - A stack left over from another turn is cleared before anything else.
 * - A spend that raises the count and stays within capacity opens a new step,
 *   dropping the oldest if the stack is already as deep as the turn's capacity.
 * - Anything else on a turn with an open step joins the newest step -- the
 *   GM's over-budget spends included.
 * - Before the turn's first step, nothing is recorded.
 */
export function decideUndo(
  turnBefore: UndoTurn | undefined,
  turnAfter: UndoTurn | undefined,
  steps: readonly UndoStep[],
  spend: SpendChange | undefined,
): UndoDecision {
  if (turnAfter === undefined || !sameTurn(turnBefore, turnAfter)) {
    return steps.length > 0 ? { kind: 'clear' } : { kind: 'ignore' };
  }
  const stale = steps.length > 0 && !sameTurn(steps[0], turnAfter);
  const open = stale ? 0 : steps.length;
  if (
    spend !== undefined &&
    spend.after > spend.before &&
    spend.after <= spend.capacity
  ) {
    return { kind: 'open', clearFirst: stale, dropOldest: open >= spend.capacity };
  }
  if (stale) {
    return { kind: 'clear' };
  }
  return open > 0 ? { kind: 'append' } : { kind: 'ignore' };
}

function activeCombat(store: WorldStore): Combat | undefined {
  return store
    .listDocuments('combat')
    .flatMap((raw) => {
      const parsed = combatSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .find((combat) => combat.status === 'active');
}

function turnOf(combat: Combat | undefined): UndoTurn | undefined {
  return combat?.status === 'active' && combat.activeCombatantId !== undefined
    ? { combatId: combat.id, combatantId: combat.activeCombatantId, round: combat.round }
    : undefined;
}

/** A document as it was before this operation: its recorded before-state if it was touched, else as it is now. */
function asBefore(
  store: WorldStore,
  befores: ReadonlyMap<string, unknown>,
  id: string,
): unknown {
  return befores.has(id) ? befores.get(id) : store.getDocument(id);
}

/**
 * Files `befores` (what one operation touched, from `recordTurnBefores`) under
 * the right undo step, opening, appending to, or clearing the stack per
 * `decideUndo`. Runs inside the operation's own transaction, after it has
 * applied, so the stack can never disagree with what was written.
 */
export function recordTurnUndo(
  store: WorldStore,
  befores: ReadonlyMap<string, unknown>,
  seatId: string,
): void {
  const combat = activeCombat(store);
  const turnAfter = turnOf(combat);
  const combatBefore =
    combat === undefined
      ? undefined
      : combatSchema.safeParse(asBefore(store, befores, combat.id)).data;
  const turnBefore = turnOf(combatBefore);

  let spend: SpendChange | undefined;
  if (turnAfter !== undefined) {
    const after = combatantSchema.safeParse(
      store.getDocument(turnAfter.combatantId),
    ).data;
    const before = combatantSchema.safeParse(
      asBefore(store, befores, turnAfter.combatantId),
    ).data;
    if (after !== undefined && before !== undefined) {
      spend = {
        before: before.turn.actionsSpent,
        after: after.turn.actionsSpent,
        capacity: turnCapacityOf(store, after),
      };
    }
  }

  const steps = store.listUndoSteps();
  const decision = decideUndo(turnBefore, turnAfter, steps, spend);
  if (decision.kind === 'clear') {
    store.clearUndo();
    return;
  }

  let step: number | undefined;
  if (decision.kind === 'open' && turnAfter !== undefined) {
    if (decision.clearFirst) {
      store.clearUndo();
    } else if (decision.dropOldest && steps[0] !== undefined) {
      store.deleteUndoStep(steps[0].step);
    }
    step = store.openUndoStep(turnAfter, seatId);
  } else if (decision.kind === 'append') {
    step = steps.at(-1)?.step;
  }
  if (step === undefined) {
    return;
  }
  for (const [documentId, before] of befores) {
    store.putUndoDocument(step, documentId, before);
  }
}

/** What `undoLastStep` changed: the documents it restored, and the ones it un-created. */
export interface UndoChange {
  readonly documents: BaseDocument[];
  readonly deleted: BaseDocument[];
}

/**
 * Undoes the current turn's most recent step (ADR 0019): every document it
 * touched goes back to its recorded before-state, or is deleted if the step
 * created it. The GM may undo any step; a player only one opened by their own
 * seat. There is no separate "is it still that combatant's turn" check: the
 * stack is always cleared on a turn change (`decideUndo`), so a step only
 * ever exists while it is still the turn it was opened on.
 */
export function undoLastStep(
  store: WorldStore,
  seat: Seat,
  payload: { combatId: string },
): UndoChange {
  const step = store.listUndoSteps().at(-1);
  if (step === undefined || step.combatId !== payload.combatId) {
    throw new OperationRejected('there is nothing to undo this turn');
  }
  if (!seat.isGM && step.seatId !== seat.id) {
    throw new OperationRejected('only the GM can undo someone else’s action');
  }

  const documents: BaseDocument[] = [];
  const deleted: BaseDocument[] = [];
  for (const { documentId, before } of store.listUndoDocuments(step.step)) {
    if (before === null) {
      const existing = baseDocumentSchema.safeParse(store.getDocument(documentId));
      store.deleteDocument(documentId);
      if (existing.success) {
        deleted.push(existing.data);
      }
    } else if (baseDocumentSchema.safeParse(before).success) {
      // `before` is the document's own previously-stored, already-validated
      // body -- restored whole, not through `baseDocumentSchema.safeParse`,
      // which would strip every field a concrete document type adds beyond
      // the base envelope (x/y, turn, actorId, ...). The `safeParse` above
      // only confirms it still has a valid envelope to put back.
      const restored = before as BaseDocument;
      store.putDocument(restored);
      documents.push(restored);
    }
  }
  store.deleteUndoStep(step.step);
  return { documents, deleted };
}
