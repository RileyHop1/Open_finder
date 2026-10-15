/**
 * Edits to one spellcasting entry's lists (ADR 0025, `docs/spellcasting.md`), as
 * pure functions returning the new entry; the sheet sends it whole with
 * `actor.setSpellcasting`. None of them checks the rules (ADR 0023): a spell can
 * be prepared in a slot below its rank, or in a rank with no slots, and the
 * sheet's lists say so instead.
 */

import type { CharacterItem, SpellcastingEntry } from '@hearthtable/pf2e';

/** A spell item on the character, as the editor offers it. */
export interface SpellOption {
  readonly itemId: string;
  readonly name: string;
  readonly rank: number;
  readonly cantrip: boolean;
}

/** Every spell item on the character, cantrips included, by rank then name. */
export function spellOptions(items: readonly CharacterItem[]): SpellOption[] {
  return items
    .flatMap((item) =>
      item.entry.kind === 'spell'
        ? [
            {
              itemId: item.id,
              name: item.entry.name,
              rank: item.entry.rank,
              cantrip: item.entry.traits.includes('cantrip'),
            },
          ]
        : [],
    )
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

/** A prepared entry with one more copy of `itemId` in a slot of `rank`. */
export function prepareSpell(
  entry: SpellcastingEntry,
  itemId: string,
  rank: number,
): SpellcastingEntry {
  if (entry.kind !== 'prepared') {
    return entry;
  }
  return { ...entry, prepared: [...entry.prepared, { rank, itemId, expended: false }] };
}

/** A prepared entry without the row at `index` of its `prepared` list. */
export function unprepareSpell(
  entry: SpellcastingEntry,
  index: number,
): SpellcastingEntry {
  if (entry.kind !== 'prepared') {
    return entry;
  }
  return { ...entry, prepared: entry.prepared.filter((_, i) => i !== index) };
}

/** A spontaneous entry that knows `itemId` (once). */
export function learnSpell(entry: SpellcastingEntry, itemId: string): SpellcastingEntry {
  if (entry.kind !== 'spontaneous' || entry.repertoire.includes(itemId)) {
    return entry;
  }
  return { ...entry, repertoire: [...entry.repertoire, itemId] };
}

/** A spontaneous entry that no longer knows `itemId`, and so no longer has it as a signature spell. */
export function forgetSpell(entry: SpellcastingEntry, itemId: string): SpellcastingEntry {
  if (entry.kind !== 'spontaneous') {
    return entry;
  }
  return {
    ...entry,
    repertoire: entry.repertoire.filter((id) => id !== itemId),
    signature: entry.signature.filter((id) => id !== itemId),
  };
}

/** The entry with `itemId` among its cantrips (once). */
export function addCantrip(entry: SpellcastingEntry, itemId: string): SpellcastingEntry {
  return entry.cantrips.includes(itemId)
    ? entry
    : { ...entry, cantrips: [...entry.cantrips, itemId] };
}

/** The entry without `itemId` among its cantrips. */
export function removeCantrip(
  entry: SpellcastingEntry,
  itemId: string,
): SpellcastingEntry {
  return { ...entry, cantrips: entry.cantrips.filter((id) => id !== itemId) };
}

/**
 * The entry with `max` slots of `rank`, set by hand. Spontaneous slots keep what
 * was used. A prepared rank set to none is removed, so it stops being listed;
 * its prepared spells stay (the sheet shows them as past the slots).
 */
export function setSlotMax(
  entry: SpellcastingEntry,
  rank: number,
  max: number,
): SpellcastingEntry {
  const key = String(rank);
  const count = Math.max(0, Math.trunc(max));
  if (entry.kind === 'spontaneous') {
    const used = entry.slots[key]?.used ?? 0;
    const slots = { ...entry.slots };
    if (count === 0 && used === 0) {
      delete slots[key];
    } else {
      slots[key] = { max: count, used };
    }
    return { ...entry, slots };
  }
  const slots = { ...entry.slots };
  if (count === 0) {
    delete slots[key];
  } else {
    slots[key] = count;
  }
  return { ...entry, slots };
}

/** The slot maximum of `rank`, 0 when the entry has none. */
export function slotMax(entry: SpellcastingEntry, rank: number): number {
  const slot = entry.slots[String(rank)];
  return typeof slot === 'number' ? slot : (slot?.max ?? 0);
}
