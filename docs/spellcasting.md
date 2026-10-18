# Spellcasting

How a character's spellcasting is stored and shown. The decision and its
alternatives are in [ADR 0025](adr/0025-spellcasting-model.md); this page is the
shape of the data, and grows as each stage lands.

**Status:** the data shape, the class tables, the derivation, the statistics and the cast
operations (below) exist. The Spells tab and each class's wizard step are later PRs of
milestone 8(b).

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
turns a style and a level into slots per rank. The spellcasting proficiency rank is
not in the table: it comes from the class features' `rankUps` (Expert Spellcaster at
7, a Cloistered Cleric's third doctrine at 7, a Warpriest's fourth at 11), and
`deriveCharacter` passes it in, trained when nothing raises it.

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

**Spell picks** are the build's `spells` (`{ cantrips, ranked }`, compendium
references). `deriveCharacter` grants each as an item and returns the ones that
resolved as `spellPicks`; a pick that is missing or is not a spell is left out with a
warning (`missing-entry`, `not-a-spell`), and more cantrips than the class has is a
`too-many-cantrips` warning, with all of them still granted (ADR 0023).
`addSpellPicks` then puts their item ids in the class entry: the cantrips in its
cantrips, and for a spontaneous caster the ranked picks in its repertoire. A prepared
caster's ranked picks are only items (a Wizard's spellbook, a Cleric's first choices);
preparing them is play. Like the merge, it only adds, so a pick removed from the build
stays on the sheet until removed there. A spontaneous caster's repertoire holds as many
ranked spells as it has slots (`too-many-known-spells` past that, still granted); a
prepared caster's ranked picks are not counted yet.

**What a class grants by itself** is `rules/classSpells.ts`, our own data because the
imported class features say it only in prose. A row names the focus pool the class
starts with, the cantrips and focus spells it grants, and the spells a class choice adds
(`byChoice`, keyed like `build.classChoices`). `deriveCharacter` grants them as items and
adds them to `spellPicks` (cantrips to the cantrips, choice spells to the ranked ones),
never counting them against the picks, and returns the pool as `focusPoints`.
`actor.applyBuild` only ever raises the sheet's focus pool, so a point spent in play stays
spent. The **Bard** has a row: Courageous Anthem (a composition cantrip), Counter
Performance (a focus spell), a pool of 1, and its muse's spell (Enigma: Sure Strike,
Maestro: Soothe, Polymath: Phantasmal Minion, Warrior: Fear). A row's
`focusByChoice` grants focus spells by a class choice the same way: the **Druid**
has a pool of 1 and its order's spell (Animal: Heal Animal, Leaf: Cornucopia, Storm:
Tempest Surge, Untamed: Untamed Shift), listed under Focus spells on the sheet. The
order's skill and feat come from the imported order itself.

A row can also carry a **font**: extra slots at the class's highest rank that hold only
one spell, picked by a class choice. The **Cleric's Divine Font** is one: 4 slots (5
from level 5, 6 from level 15) holding only Heal or only Harm, by the `divine-font`
choice. `deriveFont` makes it its own prepared entry beside the class's (source
`class:cleric:font`, named "Divine Font", the same tradition, attribute and
proficiency), and `prepareFont` puts the chosen spell in every slot, so the Spells tab
lists "Heal" four times, each cast with one button. Re-applying the build keeps copies
already cast cast; levelling up moves the slots to the new highest rank, fresh. Before
the font is chosen the entry has its slots and nothing prepared. The other casters get
their rows in their own PRs.

A class whose tradition depends on a choice (the Witch's patron, the Sorcerer's
bloodline) gets **no entry yet** and a `spellcasting-tradition-undecided` warning,
because how a patron or bloodline maps to a tradition is that class's own PR; the
Draconic bloodline even varies by dragon. The creator's review tells the player to
add the spellcasting by hand until then.

The casting attribute follows the key attribute `actor.applyBuild` settles on: the
one sent, else the one already on the sheet if the class offers it, else the class's
first option (so a blank sheet's `str` never becomes a Wizard's casting attribute).

## Statistics
Each entry has a **spell attack** and a **spell DC**, built into `prepareCharacter`'s
`statistics` like every other number (ADR 0008), keyed `spellAttack:<entry id>` and
`spellDc:<entry id>`, so each comes with a modifier breakdown:

- spell attack: the casting attribute modifier plus the entry's proficiency (its own
  `rank` and the level), plus any modifiers. A check total, so no base.
- spell DC: `10 +` the same two lines, plus any modifiers.

Rule-element modifiers reach them by selector: `spell-attack` (and `attack`, which a
strike also uses) for the roll, `spell-dc` for the DC, and `all` for both. Conditions
apply by the casting attribute: stupefied hits an Intelligence, Wisdom or Charisma
caster's roll and DC, frightened and sickened hit both, prone is a circumstance
penalty to the attack roll only. Two entries each get their own pair. Golden tests:
`rules/spellStatistics.test.ts` (the arithmetic and the conditions) and
`golden/casterStatistics.test.ts` (each caster, end to end from its class).

## Casting
Three operations change the state ([operations.md](operations.md)); the rules are pure
functions in `rules/castSpell.ts`, and the server module is `apps/server/src/castSpell.ts`.

- **`actor.castSpell`** spends what the spell costs and posts a `spellCast` card
  ([chatMessage.md](chatMessage.md)) with the spell's text, the DC of its save, or the
  spell attack bonus. A *cantrip* costs nothing. A *focus* cast spends a focus point.
  Anything else spends a *slot* of the rank cast at (the spell's own rank unless the
  player heightens it), from the entry it names. Cantrips and focus spells heighten to
  half the caster's level, rounded up.
- **`actor.refocus`** regains one focus point, up to the maximum.
- **`actor.restSpells`** is daily preparation: all slots available again. It does not
  touch focus points.

What a slot cast does depends on the kind of entry. A *spontaneous* entry counts the slot
as used, **even past its maximum**, so it reads "-1 slot". A *prepared* entry marks one
prepared copy of that spell, at that rank, as cast; casting a spell that is not
prepared, or whose copies are all cast, changes nothing. Focus points stop at zero.
In every case the cast **still happens** and the card says so in words ("Nothing left to
spend: cast anyway (-1 slot)"), because the person clicking makes the ruling (ADR 0023).
The GM can set any count by hand.

The spell attack is rolled as an ordinary check on the entry's `spellAttack:<id>`
statistic (`actor.rollCheck`), so it has a breakdown and a DC like any other roll. A
focus spell has no entry of its own yet, so its card takes the DC of the first entry of
its tradition; focus entries arrive with the classes that have focus spells.

## Editing the lists
`actor.setSpellcasting` ([operations.md](operations.md)) replaces one entry whole, or adds
a new one. It is the only way to change what is prepared or known, the cantrips or the
slot counts, because `actor.update` never writes into an array
(`packages/core/src/patch.ts`). Focus points are an object, so `system.focusPoints.max`
and `.current` are set with `actor.update` like any other number.

The client sends the whole entry and the server stores it, checking only that it is a
well-formed entry ([Nothing is checked](#nothing-is-checked)). Two things are kept by the
server: the entry's build `source` (so applying a build again still updates the entry it
made) and the one-id-one-entry rule. It is last write wins, like `actor.setQuickbar`: an
edit made from a stale sheet can undo a cast made a moment before it. For a table of five
friends that is cheaper than a patch language for entries.

*Rejected: one operation per change* (`prepareSpell`, `learnSpell`, `setSlotMax`, ...).
Each would be a few lines on the server, but the sheet needs a dozen of them and every
later caster step would want another. One whole-entry operation covers them, and the
pure edits stay on the client where they are tested without a server.

## The Spells tab
`SpellsPanel.vue` (laid out by `sheet/spellsModel.ts`, which is pure) shows, above the
plain spell list:

- the **focus pool** with a Refocus button, and **Rest (daily preparation)**;
- per entry, the **spell attack** (with a Roll button) and **spell DC**, each opening its
  breakdown like any other number;
- **slots per rank**, as pips and as words ("1 of 2 left"; "-1 (1 over the maximum)"
  past the maximum). The pips are decoration (`aria-hidden`, outlined when empty, dashed
  when over), so nothing depends on colour or shape;
- **cantrips**, the **prepared rows** by slot rank or the **repertoire** by spell rank,
  and **focus spells**, each with a Cast button. A prepared row that was cast reads
  "(cast)" and offers "Cast again". A spontaneous spell has a rank menu when a higher
  slot exists, so heightening is a choice at the moment of casting.

Cast buttons are never disabled for having nothing left (ADR 0023); the cast goes
through and the chat card says it was overspent. The tab is read-only for a viewer who
cannot edit the character.

**Edit spells** (owner or GM) opens hand editing, in `SpellListEditor.vue` with the pure
edits in `sheet/spellEdits.ts`:

- slot counts per rank (a field for each rank with slots and one above the highest);
- cantrips, the prepared rows (spell and slot rank) or the repertoire, picked from the
  spell items the character has. A spell gets onto the character through the plain list
  below the panel ("Add from the compendium") or a build;
- the focus pool's maximum and current points (`actor.update`), with a note past the
  rules' cap of 3.

Each change sends the whole entry with `actor.setSpellcasting`. Nothing is refused: a
spell above the slot's rank can be prepared there with a warning in words, more rows than
slots are fine, and a reference to a spell the character no longer has is listed as
"(missing spell)" with a Remove button. Adding or removing a whole entry by hand is not
offered yet; entries come from a build.

## Nothing is checked
The schema accepts what the rules would call a mistake: more prepared rows than
slots, a row at the wrong rank, a signature spell that is not in the repertoire,
an item id the character no longer has. Telling the player is the sheet's job, and
the GM can set any number by hand ([ADR 0023](adr/0023-calculate-dont-enforce.md)).
