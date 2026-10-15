/**
 * What the Spells tab shows about a character's casting (ADR 0025,
 * `docs/spellcasting.md`), worked out from the sheet data with no I/O. Display
 * only: it never decides whether a cast is allowed (ADR 0023), it only lays out
 * the slots left, the spells that can be cast and which of them already were.
 */

import type { CharacterData, CharacterItem, SpellcastingEntry } from '@hearthtable/pf2e';

/** A spell on the sheet that can be cast, from a prepared row, a repertoire, a cantrip list or the focus spells. */
export interface CastableSpell {
  readonly itemId: string;
  readonly name: string;
  readonly slug: string;
  /** The spell's own rank. */
  readonly rank: number;
  /** A prepared row that has been cast. Always false elsewhere. */
  readonly expended: boolean;
}

/** One rank's slots: `used` can exceed `max` (cast past the maximum), which reads "-N". */
export interface RankSlots {
  readonly rank: number;
  readonly max: number;
  readonly used: number;
  /** Slots still available, never below zero. */
  readonly left: number;
  /** How far past the maximum, 0 when within it. */
  readonly over: number;
}

export interface SpellGroup {
  readonly rank: number;
  readonly spells: readonly CastableSpell[];
}

export interface EntryView {
  readonly entry: SpellcastingEntry;
  readonly attackKey: string;
  readonly dcKey: string;
  readonly ranks: readonly RankSlots[];
  readonly cantrips: readonly CastableSpell[];
  /** Prepared rows grouped by the slot rank they sit in, or the repertoire grouped by spell rank. */
  readonly groups: readonly SpellGroup[];
  /** References to items the character no longer has. */
  readonly missing: number;
  /** The highest rank worth offering when heightening: the highest with slots, at least the lowest spell rank. */
  readonly highestRank: number;
}

export interface SpellsView {
  readonly entries: readonly EntryView[];
  readonly focus: { readonly max: number; readonly current: number };
  /** Spell items with the focus trait, castable by spending a focus point. */
  readonly focusSpells: readonly CastableSpell[];
  /** Whether there is anything to show at all (an entry, a focus pool or a focus spell). */
  readonly any: boolean;
}

function spellOf(item: CharacterItem, expended = false): CastableSpell | undefined {
  if (item.entry.kind !== 'spell') {
    return undefined;
  }
  return {
    itemId: item.id,
    name: item.entry.name,
    slug: item.entry.slug,
    rank: item.entry.rank,
    expended,
  };
}

const byName = (a: CastableSpell, b: CastableSpell): number =>
  a.name.localeCompare(b.name);

function grouped(
  spells: readonly (CastableSpell & { slotRank?: number })[],
): SpellGroup[] {
  const ranks = [...new Set(spells.map((s) => s.slotRank ?? s.rank))].sort(
    (a, b) => a - b,
  );
  return ranks.map((rank) => ({
    rank,
    spells: spells.filter((s) => (s.slotRank ?? s.rank) === rank).sort(byName),
  }));
}

function entryView(
  entry: SpellcastingEntry,
  items: ReadonlyMap<string, CharacterItem>,
): EntryView {
  let missing = 0;
  const find = (id: string, expended = false): CastableSpell | undefined => {
    const item = items.get(id);
    const spell = item === undefined ? undefined : spellOf(item, expended);
    if (spell === undefined) {
      missing++;
    }
    return spell;
  };

  const cantrips = entry.cantrips.flatMap((id) => find(id) ?? []).sort(byName);

  let ranks: RankSlots[];
  let groups: SpellGroup[];
  if (entry.kind === 'prepared') {
    const rows = entry.prepared.flatMap((row) => {
      const spell = find(row.itemId, row.expended);
      return spell === undefined ? [] : [{ ...spell, slotRank: row.rank }];
    });
    const rankNumbers = new Set([
      ...Object.keys(entry.slots).map(Number),
      ...entry.prepared.map((r) => r.rank),
    ]);
    ranks = [...rankNumbers]
      .sort((a, b) => a - b)
      .map((rank) => {
        const max = entry.slots[String(rank)] ?? 0;
        const used = entry.prepared.filter((r) => r.rank === rank && r.expended).length;
        return {
          rank,
          max,
          used,
          left: Math.max(0, max - used),
          over: Math.max(0, used - max),
        };
      });
    groups = grouped(rows);
  } else {
    ranks = Object.entries(entry.slots)
      .map(([key, slot]) => ({
        rank: Number(key),
        max: slot.max,
        used: slot.used,
        left: Math.max(0, slot.max - slot.used),
        over: Math.max(0, slot.used - slot.max),
      }))
      .sort((a, b) => a.rank - b.rank);
    groups = grouped(entry.repertoire.flatMap((id) => find(id) ?? []));
  }

  const withSlots = ranks.filter((r) => r.max > 0).map((r) => r.rank);
  return {
    entry,
    attackKey: `spellAttack:${entry.id}`,
    dcKey: `spellDc:${entry.id}`,
    ranks: ranks.filter((r) => r.max > 0 || r.used > 0),
    cantrips,
    groups,
    missing,
    highestRank: withSlots.length === 0 ? 1 : Math.max(...withSlots),
  };
}

/** The Spells tab's view of `data`. */
export function spellsView(data: CharacterData): SpellsView {
  const items = new Map(data.items.map((item) => [item.id, item] as const));
  const focusSpells = data.items
    .flatMap((item) =>
      item.entry.kind === 'spell' && item.entry.traits.includes('focus')
        ? (spellOf(item) ?? [])
        : [],
    )
    .sort(byName);
  const entries = data.spellcasting.map((entry) => entryView(entry, items));
  return {
    entries,
    focus: data.focusPoints,
    focusSpells,
    any: entries.length > 0 || data.focusPoints.max > 0 || focusSpells.length > 0,
  };
}
