/**
 * What casting a spell, refocusing and resting do to a character's spellcasting
 * state (ADR 0025, `docs/spellcasting.md`). Pure functions over the entries; the
 * server's `actor.castSpell`, `actor.refocus` and `actor.restSpells` call them and
 * post the chat card.
 *
 * Nothing here refuses (ADR 0023). Casting with nothing to spend still returns an
 * entry, plus `overspent: true` for the card to say so. A spontaneous slot is
 * counted past its maximum, so it reads "-1 slot"; a prepared spell that was not
 * prepared, or was already cast, changes nothing; focus points stop at zero.
 */

import type { FocusPoints, SpellcastingEntry } from '../content/spellcasting.js';

/** A cantrip is cast at will: it costs nothing and heightens itself to half the caster's level, rounded up. */
export function cantripRank(level: number): number {
  return Math.min(10, Math.max(1, Math.ceil(level / 2)));
}

export interface SpendResult<T> {
  readonly value: T;
  /** True when there was nothing to spend (the cast still happens). */
  readonly overspent: boolean;
}

/**
 * `entry` with one slot of `rank` spent on the spell the item `spellItemId` is.
 * - Spontaneous: `used` goes up by one, even past `max`; overspent when it ends above it.
 * - Prepared: the first row for that item at that rank that is not yet cast is
 *   marked cast; with no such row nothing changes and it is overspent.
 */
export function spendSlot(
  entry: SpellcastingEntry,
  spellItemId: string,
  rank: number,
): SpendResult<SpellcastingEntry> {
  const key = String(rank);
  if (entry.kind === 'spontaneous') {
    const slot = entry.slots[key] ?? { max: 0, used: 0 };
    const used = slot.used + 1;
    return {
      value: { ...entry, slots: { ...entry.slots, [key]: { max: slot.max, used } } },
      overspent: used > slot.max,
    };
  }
  const index = entry.prepared.findIndex(
    (row) => row.itemId === spellItemId && row.rank === rank && !row.expended,
  );
  if (index === -1) {
    return { value: entry, overspent: true };
  }
  return {
    value: {
      ...entry,
      prepared: entry.prepared.map((row, i) =>
        i === index ? { ...row, expended: true } : row,
      ),
    },
    overspent: false,
  };
}

/** One focus point spent; at zero nothing changes and it is overspent. */
export function spendFocus(pool: FocusPoints): SpendResult<FocusPoints> {
  return pool.current > 0
    ? { value: { ...pool, current: pool.current - 1 }, overspent: false }
    : { value: pool, overspent: true };
}

/** Refocus: one focus point back, up to the maximum (a pool already full is unchanged). */
export function refocus(pool: FocusPoints): FocusPoints {
  return { ...pool, current: Math.min(pool.max, pool.current + 1) };
}

/** Daily preparation: every slot available again. Prepared spells stay prepared; they are no longer cast. */
export function restEntry(entry: SpellcastingEntry): SpellcastingEntry {
  if (entry.kind === 'spontaneous') {
    return {
      ...entry,
      slots: Object.fromEntries(
        Object.entries(entry.slots).map(([rank, slot]) => [
          rank,
          { max: slot.max, used: 0 },
        ]),
      ),
    };
  }
  return {
    ...entry,
    prepared: entry.prepared.map((row) => ({ ...row, expended: false })),
  };
}
