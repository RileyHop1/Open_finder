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
guessed at. See [rulings.md](rulings.md).

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
```
until-end-of-turn      | whose turn, resolved against the Combat tracker
until-start-of-turn    | likewise
rounds(n)              | decremented by the combat tracker
minutes(n) / hours(n)  | decremented by the Calendar clock
sustained              | ends if the caster stops sustaining
until-removed          | manual only
until-condition-met    | e.g. until you Recover; needs an explicit trigger
```

Durations tick in the combat tracker (milestone 5), which is why conditions and
the tracker ship close together. Outside combat, `minutes`/`hours` durations are
advanced by the `Calendar` — the same clock that overworld travel and downtime
use, which is why `Calendar` is a first-class document.

**Expiry is a server operation**, not a client timer. A condition that expires
must broadcast like any other change (ADR 0005).

## The dying chain
The fiddliest part of the system, and worth writing tests for before writing code.

- **dying** increases as you take damage while unconscious; at **dying 4** the
  character dies **(confirm the threshold and its interaction with doomed)**.
- **wounded** raises the dying value you re-enter at, so repeated drops get
  progressively more dangerous.
- **doomed** reduces the dying value at which death occurs.
- **Recovering** removes dying and increases wounded.

These three interact multiplicatively and a mistake here kills a player character
who should have lived. Treat every transition as a golden test case, and make the
GM override path (see GM experience in CLAUDE.md) especially prominent on this
one — it is the automation a GM is most likely to want to overrule.

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
