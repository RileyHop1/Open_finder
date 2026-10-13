# Spellcasting

How a character's spellcasting is stored and shown. The decision and its
alternatives are in [ADR 0025](adr/0025-spellcasting-model.md); this page is the
shape of the data, and grows as each stage lands.

**Status:** the data shape (below) exists. The class tables, the derivation, the
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

## Nothing is checked
The schema accepts what the rules would call a mistake: more prepared rows than
slots, a row at the wrong rank, a signature spell that is not in the repertoire,
an item id the character no longer has. Telling the player is the sheet's job, and
the GM can set any number by hand ([ADR 0023](adr/0023-calculate-dont-enforce.md)).
