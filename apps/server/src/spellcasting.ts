/**
 * `actor.setSpellcasting` (ADR 0025, `docs/spellcasting.md`): replaces one of a
 * character's spellcasting entries whole, or adds it. It is how the lists change
 * (what is prepared or known, the cantrips, the slot counts), because
 * `actor.update` never writes into an array.
 *
 * The entry must be a well-formed one, and that is all the server asks of it: a
 * spell at the wrong rank, more rows than slots, a count set by hand and an item
 * the character no longer has are all accepted (ADR 0023). Permissions are still
 * enforced; `editCharacter` does that for every sheet edit.
 */

import type { Actor, Seat } from '@hearthtable/core';
import { type SpellcastingEntry, spellcastingEntrySchema } from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

/**
 * `entry` with its build `source` set to `source`, or absent for `undefined`.
 * The source is the build's bookkeeping (applying a build again updates the entry
 * it made instead of adding a second), so a client edit neither adds nor removes it.
 */
function withSource(entry: SpellcastingEntry, source: string | undefined) {
  const { source: _ignored, ...rest } = entry;
  return source === undefined ? rest : { ...rest, source };
}

/** Replaces the entry with `payload.entry.id` on the character, or appends it. Owner or GM only. */
export function setSpellcasting(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string; entry: Readonly<Record<string, unknown>> },
): Actor {
  const parsed = spellcastingEntrySchema.safeParse(payload.entry);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.map(String).join('.') ?? '';
    throw new OperationRejected(
      `invalid spellcasting entry: ${path === '' ? '' : `${path}: `}${issue?.message ?? 'not valid'}`,
    );
  }
  const entry = parsed.data;

  return editCharacter(store, seat, payload.actorId, (data) => {
    const existing = data.spellcasting.find((e) => e.id === entry.id);
    const next = withSource(entry, existing?.source);
    return {
      ...data,
      spellcasting:
        existing === undefined
          ? [...data.spellcasting, next]
          : data.spellcasting.map((e) => (e.id === entry.id ? next : e)),
    };
  });
}
