# Conditions

Conditions are `Item` documents (see the document model in CLAUDE.md) attached to
an `Actor`. They are the main way the rules engine changes a character mid-combat,
and they are where automation is most visible to players — a wrong *frightened*
value is noticed immediately.

Rules references are Remaster (Player Core), spot-checked against Archives of Nethys (https://2e.aonprd.com/Conditions.aspx). Where marked **(confirm)**, verify
against the book during implementation.

## Remaster naming
We are Remaster-only (see Ground rules), and the Remaster renamed several
conditions. Use the current names everywhere — in schemas, slugs, and UI:

- **off-guard**, not *flat-footed*. This is the one that will trip up anyone who
  learned the game pre-Remaster, and the importer must not carry the old slug
  through.

Legacy names never appear in our data. If upstream content uses one, the importer
maps it or drops the entry (see the exclusion rule in CLAUDE.md).

## Compendium definition (milestone 2)

Before any of the runtime shape below exists, there is a read-only
*definition* every applied instance is created from --
`systems/pf2e`'s `conditionEntrySchema`, imported like any other content
kind (`docs/compendium.md`):

```ts
{
  kind: 'condition',
  slug: 'frightened',
  valued: true,
  maxValue: 4,           // optional -- absent for an unbounded valued condition
  group: 'detection',    // optional -- mutually exclusive progression membership
  overrides: [],         // condition slugs this one supersedes when applied
}
```

**Deliberate gap:** how a valued condition's number becomes a `Modifier`
(frightened 2 → a −2 status penalty) is not part of this definition. The
existing `flatModifier` rule element takes a fixed integer `value` -- it has
no way to express "scale with this condition's own current value," which is
an actor-instance fact, not static content. Designing that mapping is part
of the runtime shape below, which this page still only specifies rather than
implements (see the Milestones list in CLAUDE.md for when it lands).

`group` and `overrides` are marked **(confirm)** in the schema pending real
upstream data -- the detection ladder (`observed`/`hidden`/`undetected`/
`unnoticed`) below is the intended shape of that grouping, not yet verified
against how upstream actually structures it.

## Shape (applied instance, milestone 3/5)
```ts
{
  slug: string;              // "frightened", "off-guard"
  valued: boolean;           // does it carry a number
  value?: number;            // 1..N when valued
  duration: Duration;
  source: DocumentRef;       // what applied it — an item, spell, or another actor
  modifiers: Modifier[];     // what it contributes (see ADR 0008)
}
```

Conditions contribute **`Modifier` records**, never direct edits to a statistic.
*Frightened 2* does not subtract 2 from your attack bonus; it contributes a −2
status penalty that the resolver applies alongside everything else. That is what
makes it show up correctly in a breakdown, and what makes two competing status
penalties resolve by the stacking rules rather than by both being subtracted.

## Modifiers from conditions (milestone 3)

`conditionModifiers(conditions, target)` (`systems/pf2e/src/rules/conditionModifiers.ts`)
answers the gap above. It is asked per statistic, because whether a condition
applies depends on the attribute a statistic is based on. A `ConditionTarget`
is `ac`, `save` (with which save), `perception`, `classDc` (with the key
attribute), `skill` (any slug, so Lores work), `attack` and `damage` (each with
the attribute the roll adds), or `maxHp` (with the level).

| Condition | Effect |
| --- | --- |
| clumsy N | -N status to rolls and DCs based on Dexterity (AC, Reflex, Dex skills, Dex attacks) |
| enfeebled N | -N status to Strength-based rolls and DCs, and to Strength damage |
| stupefied N | -N status to Intelligence-, Wisdom-, and Charisma-based rolls and DCs (Will, Perception, their skills) |
| drained N | -N status to Constitution-based rolls and DCs (Fortitude), and max HP reduced by level x N |
| frightened N, sickened N | -N status to every check and DC |
| off-guard | -2 circumstance to AC |
| prone | -2 circumstance to attack rolls, plus off-guard |
| restrained, grabbed, paralyzed, confused | off-guard |
| fatigued | -1 status to AC and saves |
| fascinated | -2 status to Perception and skill checks |
| unconscious | -4 status to AC, Perception, and Reflex, plus off-guard (it also carries blinded; see rulings) |

Everything else (slowed, stunned, quickened, dying, wounded, doomed, blinded,
dazzled, concealed, the detection states) contributes no modifier and is not
guessed at. See [rulings.md](rulings.md). Slowed, stunned, and quickened are
**action rules**, not modifiers: `actionCapacity` and `startOfTurn` apply them
([action-economy.md](action-economy.md)).

### Adding, setting, and removing

`addCondition`, `setCondition`, and `removeCondition`
(`systems/pf2e/src/rules/conditionMerge.ts`) are the pure logic behind the
server's condition operations. A character holds one entry per slug.

- `addCondition` is for automation and ordinary play. A second source of a
  valued condition keeps the **higher** value, never the sum **(confirm)** the
  wording against Player Core's conditions appendix. The value is clamped to at
  least 1 and to the definition's `maxValue`. A binary condition already present
  is left as it was.
- `setCondition` is the GM override: it sets the value exactly (so it can go
  down), and a value of 0 removes the condition.
- Both clear what the new condition supersedes: the slugs in its definition's
  `overrides`, and any other member of its `group`. Both fields were checked
  against the first real import (2026-09-30): `group` is kept only for the
  detection states and the attitudes, which are mutually exclusive; the other
  upstream groupings are display-only and are not imported as groups. See
  [rulings.md](rulings.md), "Which condition groups are mutually exclusive".
- Without a definition (the compendium may not be loaded), a condition counts as
  valued only if it arrives with a value, has no maximum, and clears nothing.

### On the wire (milestone 3)

Three operations apply these ([operations.md](operations.md)):
`actor.addCondition` (merge), `actor.setCondition` (the exact override), and
`actor.removeCondition`. Both add and set are open to anyone who owns the
character, and the GM owns everything, so every condition "can be added, edited,
or removed manually" as the Automation boundaries section below requires.

The same three work on a **monster** (an NPC made from a creature, milestone 4):
its `conditions` list is edited the same way, and `prepareNpc` applies them, so
frightened 2 lowers its AC and attacks. Only the GM can, since a monster is
`none` to players. A hand-made NPC with no creature has nothing to apply them to
and is refused.

Once a compendium is imported, its condition definitions are the list of valid
slugs, and an unknown one is refused (a typo should not become a permanent
invisible condition). Before anything is imported there is nothing to check
against, so any well-formed slug is accepted and, having no definition, adds no
modifier. The dying chain and condition durations are not here; they arrive with
the combat tracker (milestone 5).

## Valued conditions
Carry a number that scales their effect: **clumsy, doomed, drained, dying,
enfeebled, frightened, sickened, slowed, stunned, stupefied, wounded**.

**Two sources of the same valued condition do not add.** Take the higher value.
*Frightened 2* plus *frightened 1* is *frightened 2*, not *frightened 3*. This is
the single most common automation bug in VTTs and it needs a golden test.

## Binary conditions
Present or absent: **blinded, concealed, confused, dazzled, deafened, fascinated,
fatigued, fleeing, grabbed, hidden, immobilized, invisible, observed, off-guard,
paralyzed, petrified, prone, quickened, restrained, unconscious, undetected,
unnoticed** **(confirm the full list against Player Core's appendix)**.

Several are mutually exclusive or form ladders — the detection states (observed /
hidden / undetected / unnoticed) are a progression, not independent flags, and
applying one must clear the others. Model detection as a single enum per
observer-target pair rather than as four booleans.

## Durations
`appliedConditionSchema` has an optional `duration` (`systems/pf2e/src/content/conditionDuration.ts`),
a union on `type` so a new kind is one more member and never a change to stored
data. **Absent means `untilRemoved`**: a condition stored before durations
existed is unchanged, which is why this needed no migration (the database
migrations version the tables, and an optional field changes no stored data).
This departs from the "migration with the first rules PR" line in
[ADR 0018](adr/0018-combat-tracker.md); a test loads a pre-duration condition
instead.

| `type` | Fields | Ends |
| --- | --- | --- |
| `untilRemoved` | none | Manual only; same as no duration |
| `turn` | `combatantId`, `boundary` (`start` \| `end`) | At the start or end of that combatant's turn |
| `rounds` | `remaining` 1-99 | Ticks down at turn boundaries |
| `sustained` | none | When the caster stops sustaining; by hand until spells are automated |
| `minutes`, `hours`, `days` | `remaining` | Stored now; **nothing expires them until the `Calendar` (milestone 13)**, so they end by hand and the UI says so |

Not built: "until a condition is met" (until you Recover, until your next daily
preparations), which needs an explicit trigger design.

**Two sources of one condition** keep the higher value, and that entry's duration
comes with it. On an equal value (or a binary condition) the longer-lasting
duration is kept; the GM's `setCondition` sets it exactly. See
[rulings.md](rulings.md), "Two sources of a condition keep the longer duration".

Durations tick in the combat tracker (milestone 5), which is why conditions and
the tracker ship close together. Outside combat, `minutes`/`hours` durations are
advanced by the `Calendar` — the same clock that overworld travel and downtime
use, which is why `Calendar` is a first-class document.

**What ticks, and when** (`startOfTurn` / `endOfTurn`,
`systems/pf2e/src/rules/turnBoundaries.ts`; [combat.md](combat.md)):
- `turn` ends at the start or end of the named combatant's turn, on whoever
  bears it.
- `rounds` counts down at the start of the **bearer's** own turn and ends at zero.
- *Frightened* drops by 1 at the end of its bearer's turn.
- `minutes`, `hours`, `days`, `sustained`, and `untilRemoved` are never touched.

See [rulings.md](rulings.md), "When a rounds duration ticks, and when frightened drops".

**Expiry is a server operation**, not a client timer. A condition that expires
must broadcast like any other change (ADR 0005).

## The dying chain
The fiddliest part of the system, and the one most worth getting right: a mistake
here kills a player character who should have lived. It is a set of pure functions
in `systems/pf2e/src/rules/dyingChain.ts`, each transition a golden case in
`dyingChain.test.ts`. **Every number is marked (confirm)**: it was written from
memory of Player Core, and not checked against the Archives of Nethys. See
[rulings.md](rulings.md), "The dying chain".

| Moment | What happens |
| --- | --- |
| Dropped to 0 HP (`knockOut`) | Unconscious, **dying 1** (2 on a critical hit) **plus wounded** |
| Damage at 0 HP (`damageWhileDying`) | dying **+1** (+2 on a critical). A stable character (unconscious, not dying) is knocked out again |
| Start of the turn (`recoveryCheck`) | Flat check **DC 10 + dying**: critical success -2, success -1, failure +1, critical failure +2 |
| Dying reaches 0 | Dying ends, **wounded +1**, and the character stays unconscious, stable |
| Healed above 0 HP (`healFromDying`) | Dying and unconscious end, **wounded +1** if they were dying (a stable character only wakes) |
| Death | dying reaches **4 minus doomed** (never less than 1), or damage left after 0 HP is at least maximum HP (`instantDeath`) |

- **wounded** raises the dying value you re-enter at, so repeated drops are
  progressively more dangerous.
- **doomed** lowers the dying value at which death occurs.
- Each function returns the new state and **events** (knocked out, dying changed,
  stabilised, revived, wounded raised, dead), so the table is told and the GM can
  undo it. `dyingStateOf` and `withDyingState` read and write the four conditions
  through the same `setCondition` / `removeCondition` the GM's override uses.
- The server applies it. `actor.applyDamage` and `actor.heal`
  (`apps/server/src/hitPoints.ts`) run the chain in the same operation as the hit
  point change: a character dropped to 0 is knocked out, damage at 0 raises dying,
  enough left over kills (the character gets a **`dead`** condition, see
  [rulings.md](rulings.md)), and healing above 0 revives. A monster only loses
  hit points; at 0 it is marked defeated in an active combat. The recovery check runs by
  itself at the start of a dying character's turn (in the same operation as
  `combat.start` or `combat.nextTurn`), and `actor.rollRecovery` is the GM's manual
  re-roll.

These interact and a wrong step is a dead character, so the **GM override** is the
whole answer to a disagreement: set or remove `dying`, `wounded`, `doomed`, and
`unconscious` directly, and mark a character dead or alive by hand. Make it
especially prominent on this one, since it is the automation a GM is most likely
to want to overrule.

## Persistent damage
Persistent damage hurts its bearer again at the **end of their turn** until a flat
check ends it. It is a **list of its own** on the actor (`persistentDamage`,
`systems/pf2e/src/content/persistentDamage.ts`), not a condition: a character
holds one entry per condition, and persistent damage stacks by damage type (fire
and bleed together). An actor stored without it parses as having none, so nothing
needed migrating. **Every number is marked (confirm)**; see
[rulings.md](rulings.md), "Persistent damage".

- Each entry is `{ id, formula, damageType, source? }`, with a plain dice formula
  (`1d6`, `2d6+3`), never a reference or a keep/drop/reroll/explode modifier.
- **One entry per damage type** (`addPersistentDamage`): a second source of the same
  type keeps the worse, the higher average (a tie keeps the existing one). Different
  types stack.
- At the end of the bearer's turn, `endOfTurn` returns what is due (`persistentDue`).
  The server (B.7) rolls each entry's damage, applies it (resistances and immunities
  are the damage layer's, and dropping to 0 HP runs the dying chain), then rolls a
  **flat check, DC 15, or DC 10 if someone helps**. A flat check is a plain d20: it
  succeeds on a natural roll at or above the DC, with no degrees and no natural 20
  or natural 1 shift. Success ends that entry (`resolvePersistentDamage`).
- Each step is an event (damaged, ended, still burning), so the table is told and the
  GM can undo it. The GM can add, edit, or remove any entry by hand.

## Automation boundaries
- The app **applies and tracks** conditions, and applies their modifiers.
- The app **does not decide** whether a condition should be applied in an
  ambiguous case. Where the trigger is unclear, prompt the GM rather than
  guessing, and record the judgment call in `docs/rulings.md`.
- Every condition can be added, edited, or removed manually by the GM regardless
  of what automation thinks. No exceptions.

## Testing
- **Compendium definition** (milestone 2): see
  `systems/pf2e/src/content/condition.test.ts` -- a valued condition with and
  without a fixed max, a binary condition, `maxValue` rejected on a binary
  condition, and a condition that belongs to a group and overrides others in
  it.
- Same condition from two sources takes the higher value, both directions.
- Each valued condition's modifiers resolve through ADR 0008 with the right type.
- Detection states are mutually exclusive.
- Duration expiry at end-of-turn and start-of-turn boundaries.
- The full dying / wounded / doomed matrix.
