# Spellcasting

How a character's spellcasting is stored and shown. The decision and its
alternatives are in [ADR 0025](adr/0025-spellcasting-model.md); this page is the
shape of the data, and grows as each stage lands.

**Status:** the data shape, the class tables and the derivation (below) exist. The
statistics, the cast operations and the Spells tab are later PRs of milestone 8(b).

## On the character
`system.spellcasting` is a list of **spellcasting entries** (default empty, so a
character stored before the field existed parses as a non-caster). `system.focusPoints`
is the shared pool, `{ max, current }`, default `0` and `0`. The rules cap it at 3;
that is a warning on the sheet, not a limit in the schema.

Every entry has:

| Field | Meaning |
| --- | --- |
| `id` | The entry's own id; unique on the character |
| `kind` | `prepared` or `spontaneous` (focus and innate casting follow in their own PRs) |
| `name` | What the sheet calls it ("Wizard spellcasting") |
| `tradition` | `arcane`, `divine`, `occult` or `primal` |
| `attribute` | The attribute spell attack and spell DC use |
| `rank` | The spellcasting proficiency rank, default `trained`; separate from the class DC's |
| `cantrips` | Item ids of the cantrips. Cantrips are cast at will, so nothing is counted |

The spells are ordinary `spell` items on the character (ADR 0014); an entry only
refers to them by **item id**, so removing a spell is the existing item removal.

### Prepared entries
- `slots`: rank (`"1"` to `"10"`) to the maximum number that can be prepared.
- `prepared`: rows `{ rank, itemId, expended }`. How many slots are spent at a rank
  is the number of expended rows at that rank, so it is **never stored twice**. The
  same spell prepared twice is two rows with one `itemId`.

### Spontaneous entries
- `slots`: rank to `{ max, used }`.
- `repertoire`: item ids of the spells known.
- `signature`: item ids of the repertoire spells that can be cast at any rank.

(ADR 0025 sketched `max` and `used` for both kinds. Prepared entries keep their
usage in the rows instead, for the reason above; the decision is otherwise
unchanged.)

## The class tables
`systems/pf2e/src/rules/spellcastingTables.ts` holds what the imported data does
not: for each of the seven casters, whether it prepares or is spontaneous, its
tradition (or the class choice that decides it: the Witch's patron, the
Sorcerer's bloodline), its level 1 cantrips, and a slot style. `slotsAtLevel`
turns a style and a level into slots per rank, and `spellcastingRankAtLevel` gives
the proficiency rank (trained, expert at 7, master at 15, legendary at 19).

| Class | Kind | Tradition | Slot style |
| --- | --- | --- | --- |
| Bard | spontaneous | occult | standard |
| Cleric | prepared | divine | standard |
| Druid | prepared | primal | standard |
| Oracle | spontaneous | divine | standard |
| Sorcerer | spontaneous | by bloodline | one more per rank |
| Witch | prepared | by patron | standard |
| Wizard | prepared | arcane | standard (plus the curriculum's extra slots) |

The casting attribute is not in the table: it is the class's key attribute,
already in the imported class. **Every number is (confirm)**, and what was and was
not checked is in [rulings.md](rulings.md) ("Spell slots per rank, by level").

## Derivation
`deriveSpellcasting` (`rules/deriveSpellcasting.ts`) is pure and proposes only the
**static** parts of a caster's entry from the class and level: `source`
(`class:wizard`, so a re-apply finds it), name, kind, tradition, casting attribute
(the character's key attribute, see below), spellcasting rank, the slot maximums
and how many cantrips the class has. `deriveCharacter` returns it as
`spellcasting`.

`mergeSpellcasting` puts it on the character, and it is where play state is
protected: an entry with the same `source` has its static parts updated and
**keeps** the slots used, the prepared spells, the repertoire, the signature spells
and the cantrips; with none, a new empty entry is added. It never removes an entry,
and a hand-made entry (no `source`) is never touched. `actor.applyBuild` calls it,
so applying a build again, or levelling up, only raises the maximums.

A class whose tradition depends on a choice (the Witch's patron, the Sorcerer's
bloodline) gets **no entry yet** and a `spellcasting-tradition-undecided` warning,
because how a patron or bloodline maps to a tradition is that class's own PR; the
Draconic bloodline even varies by dragon. The creator's review tells the player to
add the spellcasting by hand until then.

The casting attribute follows the key attribute `actor.applyBuild` settles on: the
one sent, else the one already on the sheet if the class offers it, else the class's
first option (so a blank sheet's `str` never becomes a Wizard's casting attribute).

## Nothing is checked
The schema accepts what the rules would call a mistake: more prepared rows than
slots, a row at the wrong rank, a signature spell that is not in the repertoire,
an item id the character no longer has. Telling the player is the sheet's job, and
the GM can set any number by hand ([ADR 0023](adr/0023-calculate-dont-enforce.md)).
