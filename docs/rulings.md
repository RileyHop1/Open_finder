# Rulings

Every rules judgment call this project makes, and why.

## Why this file exists
"The rules are handled for you" is the product's central promise, and PF2e has
interactions the community genuinely argues about. When we automate one of those,
we are picking a side. This file records which side and why, so that:

- the same argument is not re-litigated across three separate issues;
- a contributor changing rules math can see whether they are fixing a bug or
  reversing a deliberate decision;
- a GM who disagrees can find our reasoning and override it (see the GM override
  requirement in CLAUDE.md).

Scope is judgment calls only. Ordinary bugs — we implemented the rule wrong —
belong in the issue tracker, not here.

## Policy
See "Rulings and ambiguity" in CLAUDE.md. In short: automate the unambiguous
reading; where the rules are genuinely ambiguous, implement the most common
reading, make sure the GM can override it, record it here, and pin it with a
golden test.

## How to add an entry
One entry per judgment call, newest at the bottom. Keep the format:

```
### <Short name for the interaction>
- **Rules text:** what the books actually say, and where (book + section, no
  page-length quotations).
- **The ambiguity:** what is unclear, stated neutrally.
- **Our reading:** what we implemented.
- **Alternative reading:** the other credible interpretation, and who reads it
  that way.
- **Why:** the reason we chose ours. "Most common at tables" is a valid reason;
  say so if that is the reason.
- **Golden test:** the fixture that pins this behavior.
- **Override:** how a GM who disagrees gets the other result.
```

If an entry has no golden test, it is not settled — the test is what stops the
ruling from silently drifting.

## Entries

### Proficiency without level is not supported
- **Rules text:** Player Core's proficiency rules; the Remaster's default math
  adds a character's level to every proficiency rank at trained or above.
  Separately, the GM Core (and the pre-Remaster core rulebook before it)
  publishes an optional variant, Proficiency Without Level, which drops the
  level term entirely and rebalances DCs around flat rank bonuses instead.
- **The ambiguity:** not a rules ambiguity so much as a scope question --
  whether to support the variant rule at all, since some tables prefer its
  flatter math.
- **Our reading:** level-based proficiency only. `proficiencyModifier(rank,
  level)` (`systems/pf2e/src/rules/proficiency.ts`) adds level to the rank's
  own bonus for trained and above, and untrained is a flat `+0` -- never
  level, at any rank.
- **Alternative reading:** implement Proficiency Without Level as a togglable
  variant, the way some other VTTs do.
- **Why:** CLAUDE.md's Content scope section excludes variant rules by name
  (alongside Free Archetype and Dual-Class) precisely because supporting more
  than one build/math skeleton multiplies the surface area a solo maintainer
  has to test. This is that exclusion applied to the resolver.
- **Golden test:** `systems/pf2e/src/golden/fighter.test.ts` (the golden
  Fighter, E.2) exercises this function for real: its Fortitude, Reflex,
  Perception (Expert at level 1), Will, and Class DC (Trained) all resolve
  through `proficiencyModifier`, plus `proficiency.test.ts`'s own exact
  values for every rank at levels 1 and 20.
- **Override:** none needed at the table -- this is a build-time content
  scope decision, not a per-character automation result a GM would want to
  flip live. A table that wants Proficiency Without Level is not using the
  rule this project implements at all, the same way a table using Free
  Archetype is outside the wizard's one supported build skeleton.

### Duplicate upstream slugs
- **What happened:** running the importer against real upstream data for the
  first time (`ci/import-smoke`'s prep work) crashed on `writePacks`'s
  duplicate-slug check. Upstream carries a `bestiary-ability-glossary-srd`
  compendium that reprints common actions -- "Reactive Strike" is the one
  that surfaced this -- under the same name as the real `actions`
  compendium's own copy, purely so a creature stat block has something to
  link to for its rules text. A real-data survey found 112 same-type,
  same-name collisions across the dataset (`action`, `feat`, `npc`, and
  `hazard` entries), so this is systemic, not a one-off.
- **The ambiguity:** nothing in ADR 0003 or ADR 0012 says what should happen
  when two upstream entries legitimately collide on `(packId, slug)`. The
  importer's every other stage fails closed on bad *content*, but this
  isn't bad content -- both entries are valid, in-scope, ORC-licensed
  Remaster material that happen to share a name.
- **Our reading:** keep whichever entry sorts first by upstream file path
  (deterministic, since `reader.ts` already sorts that way before anything
  downstream sees it), and record every entry it beat as a dropped entry
  with reason `'duplicate-slug'` -- the same `DependencyDrop` shape (and the
  same coverage-report bucket) `resolveDependencies.ts` already produces,
  rather than inventing a second, parallel "why was this dropped" list.
  `writePacks.ts`'s module doc has the implementation.
- **Alternative reading:** hardcode a preference for the "real" compendium
  over known reference/glossary packs (`bestiary-ability-glossary-srd` and
  any future lookalikes). Rejected for now: it requires the importer to
  know upstream pack *names* are meaningful, which cuts against ADR 0004
  decision 3's "nothing outside the importer knows Foundry's format"
  principle more than a path-order tiebreak does, and the coverage report
  already surfaces every collision for a maintainer to review -- if
  path-order ever picks the wrong entry in practice, that is evidence for
  revisiting this, not a reason to guess a smarter rule now.
- **Why:** simple and deterministic beats clever and unverified. The
  coverage report turns "did the tiebreak matter" into an answerable
  question instead of a guess, the same way ADR 0004 decision 5 already
  treats the inert-element coverage report as evidence over guesswork.
- **Golden test:** `writePacks.test.ts`'s "duplicate slugs" suite, and
  `runImporter.test.ts`'s end-to-end duplicate-slug case. No golden
  *character* fixture is affected -- this is importer plumbing, not rules
  math.
- **Override:** none at the table -- this resolves at import time, long
  before a GM or player ever sees the content. A maintainer who disagrees
  with a specific collision's outcome re-pins after fixing it upstream-side
  or special-casing it in a mapper, the same as any other importer
  correction.

### Which conditions change a number, and which we leave to the GM
- **Rules text:** Player Core's conditions appendix. Some conditions apply a
  fixed or valued penalty to statistics (clumsy, frightened, off-guard, ...).
  Others change the action economy (slowed, stunned, quickened), depend on what
  a creature can perceive (blinded, dazzled, concealed, hidden), or drive the
  dying chain.
- **The ambiguity:** not a reading of the text but a scope question: which of
  those we can compute correctly without combat state or line of sight.
- **Our reading:** `conditionModifiers` applies only conditions whose effect is
  a plain typed modifier on a known statistic. Every other condition is stored
  and shown, and contributes no modifier. Blinded's -4 Perception penalty,
  for example, applies only when sight is a creature's only precise sense, and
  we cannot know that, so we do not apply it.
- **Alternative reading:** apply a best guess for the situational ones.
- **Why:** a wrong number the player trusts is worse than a visible gap
  (CLAUDE.md, Rulings and ambiguity).
- **Golden test:** `systems/pf2e/src/rules/conditionModifiers.test.ts` pins each
  covered condition and the "contributes nothing" set, and
  `systems/pf2e/src/golden/conditions.test.ts` pins them end to end on the
  golden Fighter (frightened, clumsy, stupefied, enfeebled, drained, off-guard
  and prone, unconscious) plus a set of conditions that must change no number.
- **Override:** the GM adds a manual modifier for an uncovered condition, or
  disables one we applied (`Modifier.enabled`).

### Implied off-guard is a separate line that the resolver dedupes
- **Rules text:** prone, restrained, grabbed, paralyzed, confused, and
  unconscious each say the creature is off-guard. Off-guard is a -2
  circumstance penalty to AC, and circumstance penalties of the same type do
  not stack.
- **The ambiguity:** whether to model "has off-guard" as a set (add off-guard
  once) or as each condition contributing its own penalty.
- **Our reading:** each implying condition contributes its own `off-guard:<slug>`
  modifier with the causing condition as its source, and the resolver keeps only
  the best circumstance penalty. The total is -2 either way.
- **Alternative reading:** collapse them into a single off-guard modifier before
  resolving.
- **Why:** it reuses ADR 0008's stacking with no special case, and the
  breakdown shows which conditions caused it, including after one is removed.
  A prone creature that is also off-guard from a feint shows one applied line
  and one suppressed line rather than hiding the second source.
- **Golden test:** `conditionModifiers.test.ts`, "counts off-guard once even when
  a second condition implies it," and `golden/conditions.test.ts`, "off-guard,
  prone," which pins the total and which line is suppressed (a tie goes to the
  earlier modifier in the list).
- **Override:** disable either modifier, or remove the condition.

### Only equipped weapons, armor, and gear grant their rule elements
- **Rules text:** items with passive effects generally work only while worn,
  wielded, or (for magic items) invested. Player Core and GM Core describe
  investing and the limit of ten invested items.
- **The ambiguity:** what to do without modeling investiture, hands, or the
  ten-item limit. A backpack of unequipped items, a spare sword, and a worn
  cloak are all just "items."
- **Our reading:** a weapon, armor, or gear item contributes its rule elements
  only while marked `equipped`. Feats, class features, actions, and spells
  always contribute. There is no investiture and no cap.
- **Alternative reading:** count everything the character carries, or model
  investiture and worn slots.
- **Why:** the smallest rule that stops a pack full of spare gear from stacking
  bonuses, with a single toggle players understand. Investiture is a v1 non-goal.
- **Golden test:** `prepareCharacter.test.ts`, "applies a feat's rule elements
  always, but an unequipped item's only when equipped" and the armor-in-the-pack
  case. The golden fixtures exercise the equipped half end to end (every worn
  armor and wielded weapon), but none holds an unequipped item, so that half is
  pinned by unit tests only.
- **Override:** the GM equips or unequips the item, or adds a manual modifier.

### Which attribute a strike uses, with only a weapon's `range` to go on
- **Rules text:** Player Core's weapon traits. Finesse: Dexterity may replace
  Strength on melee attack rolls, with damage still using Strength. Thrown: the
  weapon can be thrown as a ranged attack and adds Strength to damage like a
  melee weapon. Propulsive: half Strength (if positive) to damage, or full if
  negative. Checked against Archives of Nethys, 2026-09-30.
- **The ambiguity:** a compendium weapon records one `range`, not whether it is
  also a melee weapon. A dagger is melee and thrown; a javelin is thrown only.
  Whether Dexterity or Strength applies depends on how it is used this turn.
- **Our reading:** a weapon with a `range` is a ranged strike (Dexterity to hit);
  one without is melee. Finesse picks the higher of the two modifiers
  automatically rather than asking. Propulsive rounds half Strength down.
- **Alternative reading:** emit a separate melee and thrown strike for weapons
  that are both, or ask the player which attribute to use.
- **Why:** the smallest rule that is right for the common cases (swords, bows,
  finesse weapons) without a choice prompt. The choice is also redundant for
  finesse, since the better modifier is always the player's pick.
- **Golden test:** `prepareStrikes.test.ts` pins melee, finesse (both
  directions), ranged, thrown, and propulsive (positive and negative Strength).
  The golden class fixtures cover melee, finesse (both attribute outcomes), and
  ranged strikes end to end; thrown and propulsive are unit-tested only.
- **Override:** add a manual attack modifier, or equip the weapon as another entry.
  A melee-and-thrown weapon used the other way is the known gap.

### Detection states are cleared as a group on the character, not per observer
- **Rules text:** the detection states (observed, hidden, undetected, unnoticed)
  describe how one creature perceives another, so the same creature can be
  hidden from one observer and observed by another. Player Core's conditions
  appendix lists them.
- **The ambiguity:** `docs/conditions.md` says detection is best modeled as one
  enum per observer-target pair. A character's condition list has no observer.
- **Our reading:** a character carries at most one condition from each `group`
  the compendium defines, and adding one clears the others in that group. That
  is a per-character simplification. Per-observer detection is not modeled
  until the combat tracker (milestone 5) has the context to need it.
- **Alternative reading:** model detection as a table of observer to state.
- **Why:** it keeps a character's conditions a flat list, and avoids shipping
  half of a per-observer system with no combat to drive it. Whether the
  importer's `group` data actually groups these four is still to be read from a
  real import.
- **Golden test:** `conditionMerge.test.ts` pins group clearing with an invented
  ladder (`observed`, `hidden`, `undetected`) and `overrides` clearing. No
  golden character fixture uses it; the compendium's real group data is
  unverified.
- **Override:** the GM sets or removes any condition directly with
  `setCondition` / `removeCondition`.

### Equipping armor takes off any other armor
- **Rules text:** a character wears one suit of armor at a time. Armor's AC
  bonus, Dexterity cap, and check penalty apply while it is worn (Player Core,
  armor).
- **The ambiguity:** none in the rules. The question is what the app does when
  a player marks a second suit as equipped.
- **Our reading:** equipping an armor item automatically unequips any other
  armor. Equipping a weapon or gear, or unequipping armor, never changes
  another item.
- **Alternative reading:** allow several armors to be marked equipped and warn,
  or let `prepareCharacter` pick one.
- **Why:** `prepareCharacter` reads the first equipped armor, so two equipped
  suits would make AC depend on the order of the item list, a number the player
  would trust and could not explain. Swapping is the intent nearly every time.
- **Golden test:** `apps/server/src/items.test.ts`, "takes off the other suit
  of armor when one is equipped" and "changes the derived AC once armor is
  equipped." Unit tests only; no golden character holds two suits.
- **Override:** the GM can change any item directly. A deliberate "wearing two"
  state (a specific magic item's effect) is not modeled.

### Temporary hit points
- **Rules text:** temporary hit points are a buffer that damage reduces before
  it reduces real hit points. They do not stack with temporary hit points from
  another source, and healing raises hit points only up to the maximum. **(confirm)**
  The Archives of Nethys glossary page for temporary hit points could not be
  reached on 2026-09-30 (its search is script-driven and the guessed rule IDs
  were other pages), so this is from the remaster rules as the maintainers
  understand them and has not been checked against the page.
- **The ambiguity:** none we know of in the core rules. What the app does is a
  choice: when a source grants temporary hit points to someone who has some, we
  keep the larger amount.
- **Our reading:** damage comes out of temporary hit points first and spills
  over to current hit points, which stop at 0; healing never exceeds the maximum
  and leaves temporary hit points alone; gaining temporary hit points keeps the
  larger of what you have and what you gain. Temporary hit points have no
  duration yet (that needs the calendar and the combat tracker).
- **Alternative reading:** add the amounts together, or let the player choose
  which to keep when two sources overlap. The latter is how the rule is
  sometimes played at a table.
- **Why:** the larger-amount reading is the usual one and cannot inflate a
  buffer by repeating a source.
- **Golden test:** `systems/pf2e/src/rules/hitPointChanges.test.ts` pins each
  rule. Unit tests only; no golden character takes damage.
- **Override:** the GM sets current and temporary hit points directly in the
  sheet's edit mode, bypassing all of this.

### Which condition groups are mutually exclusive
- **Rules text:** a creature has one detection state toward you (observed,
  hidden, undetected, unnoticed) and one attitude (helpful, friendly,
  indifferent, unfriendly, hostile). Other conditions stack freely: a character
  can be clumsy and enfeebled, or blinded and deafened, at once.
- **The ambiguity:** none in the rules. The question was what the upstream data
  means. Every condition carries a `group` there, and the first real import
  showed five of them: two exclusive (detection, attitudes) and three that are
  only how a sheet lists conditions (abilities, senses, death).
- **Our reading:** `group` on a condition definition means *mutually
  exclusive*, and the importer keeps it only for `detection` and `attitudes`.
  Adding a condition clears the rest of its group.
- **Alternative reading:** import every upstream group as-is. Rejected: with
  real data it made adding enfeebled silently delete clumsy, and adding deafened
  delete blinded, on a number the player would trust. The merge and clearing
  tests used an invented exclusive group, so they passed while the real data did
  not.
- **Why this is in code, not a table:** a new upstream group (a later book)
  defaults to *not* exclusive, which loses nothing; making one exclusive is a
  deliberate edit to `EXCLUSIVE_GROUPS` in `mapCondition.ts`.
- **Also found, and left as is:** `overrides` is real data (blinded over
  dazzled, stunned over slowed, and each attitude over the others). Upstream
  treats an overridden condition as suspended while the overriding one is
  present; we remove it, so it does not come back when the overriding one ends.
  That is a simplification, not a verified reading; the GM can add it back by
  hand. No condition in the import has a `maxValue`, so clamping a value to a
  maximum never applies to imported data.
- **Golden test:** `systems/pf2e/src/importer/mapCondition.test.ts`, "keeps a
  group only when its members are mutually exclusive". The clearing behavior is
  `conditionMerge.test.ts`.
- **Override:** the GM sets or removes any condition directly
  (`setCondition` / `removeCondition`).

### Persistent damage
- **Rules text:** **(confirm)** every number below. The Archives of Nethys pages
  could not be reached from the environment this was written in (2026-10-02), so
  all of it is from memory of Player Core and unverified.
- **Our reading:** persistent damage hurts its bearer at the **end of their turn**
  (after the damage is rolled and applied, a flat check follows). The flat check is
  **DC 15**, or **DC 10** if someone helps (an appropriate treatment, or help from an
  ally). It is a plain d20: it succeeds on a natural roll at or above the DC, with no
  degrees. Success ends that persistent damage; failure leaves it for the next turn.
  Several sources of the **same damage type** do not add: only the worse counts (the
  higher average). Different types stack and are rolled separately.
- **The ambiguity and the alternatives:**
  - whether a natural 20 or natural 1 on a flat check shifts anything (we say no);
  - how "the worse" is judged between two formulas (we compare the average);
  - whether each source should be tracked separately so a weaker one returns when a
    stronger ends (we keep one entry per type);
  - what counts as help for DC 10 (the caller says whether it did).
- **Why:** one entry per type is the common table reading and needs no extra state,
  and a plain flat check is the simplest consistent rule. A wrong step is a damage
  entry the GM can see and remove.
- **Override:** the GM adds, edits, or removes any persistent damage entry directly,
  and sets the HP it caused.
- **Golden test:** `systems/pf2e/src/rules/persistentDamage.test.ts` (the flat check,
  stacking, resolving) and `turnBoundaries.test.ts` ("persistent damage"). Clear the
  **(confirm)** here and in `conditions.md` when the pages can be checked.

### The dying chain
- **Rules text:** **(confirm)** every number below. The Archives of Nethys pages
  could not be reached from the environment this was written in (2026-10-02), so
  all of it is from memory of Player Core and unverified.
- **Our reading:** dropped to 0 HP, a character is unconscious with **dying 1**
  (2 on a critical hit) **plus wounded**. Damage at 0 HP raises dying by 1 (2 on a
  critical). At the start of each turn a flat check against **DC 10 + dying** moves
  dying by -2, -1, +1, or +2 for a critical success, success, failure, critical
  failure. Dying reaching 0 raises **wounded** by 1 and leaves the character
  unconscious and stable. Healing above 0 HP ends dying and unconsciousness and
  raises wounded by 1 if they were dying. A character dies when dying reaches **4
  minus doomed** (never below 1), or when the damage left after reaching 0 HP is at
  least their maximum HP.
- **The ambiguity and the alternatives:**
  - whether a stable character who takes damage is knocked out again (we say yes,
    with wounded added again);
  - whether wounded rises when dying ends by a recovery check as well as by healing
    (we say yes, both);
  - the massive-damage rule, which some tables do not use (it is the rule in the
    book as remembered, and the GM can ignore a result);
  - whether doomed lowers the threshold or the starting value (we lower the
    threshold).
- **Why:** the plain reading of the chain, with no stored state beyond the four
  conditions, and every step visible as an event. A wrong step is one the GM sees
  and fixes.
- **Override:** the GM sets or removes `dying`, `wounded`, `doomed`, and
  `unconscious` directly (`setCondition`, `removeCondition`), and marks a character
  dead or alive by hand. The server stack (B.6) keeps that prominent.
- **Golden test:** `systems/pf2e/src/rules/dyingChain.test.ts`: a row for every
  transition, a whole sequence, and the adapter. Clear the **(confirm)** here and in
  `conditions.md` when the pages can be checked.

### Death is a `dead` condition
- **Rules text:** **(confirm)** the death thresholds are in "The dying chain"
  above. How a table records that someone has died is not a rule.
- **Our reading:** when the chain says a character dies (dying reached 4 minus
  doomed, or massive damage), the server adds a valueless **`dead`** condition
  ([conditions.md](conditions.md)). A dead character cannot be healed
  (`actor.heal` refuses); damage no longer runs the chain.
- **The alternative:** a boolean on the actor. Rejected: a second place to look,
  invisible to the conditions list and the party bar that already show state, and a
  schema change for a flag the conditions system can carry. A condition the GM
  clears by hand is also exactly the revive path.
- **Override:** the GM adds or removes `dead` like any condition; nothing else
  depends on it being set.
- **Golden test:** `apps/server/src/hitPoints.test.ts`.

### Stunned, slowed, and quickened
- **Rules text:** a turn has three actions. *Quickened* grants an extra action that
  can be used only for certain things. *Slowed N* loses you N actions, and *stunned N*
  loses you N actions and then reduces by the number lost. **(confirm)** The Archives
  of Nethys page could not be reached from the environment this was written in
  (2026-10-02), so this is from memory, and so is how stunned and slowed combine.
- **The ambiguity:** the rules do not make clear what happens when stunned and
  slowed together exceed the turn, or whether the extra quickened action can be
  counted as an ordinary one.
- **Our reading:** capacity is 3, plus 1 for quickened, minus slowed, never below 0.
  At the start of the turn stunned takes up to the **remaining** capacity (after
  slowed) and wears off by exactly what it took, so it carries over what it could not
  take. The actions it takes **count as spent**, so the tray shows them used. The
  quickened extra action is shown as restricted and never enforced.
- **Alternative reading:** stunned takes its full value from the three base actions
  regardless of slowed, so the two overlap and cost more; or the extra quickened action
  is treated as unrestricted.
- **Why:** counting lost actions as spent needs no new stored state and is exactly what
  the player sees at the table; a wrong total here is a number the GM can see and adjust.
- **Override:** the GM sets or removes any condition, and sets actions spent directly.
- **Golden test:** `actionCapacity.test.ts`, and `turnBoundaries.test.ts`, "stunned".
  Clear the **(confirm)** here when the page can be checked.

### When a rounds duration ticks, and when frightened drops
- **Rules text:** a duration measured in rounds is counted by turns, and
  *frightened* decreases by 1 at the end of each of your turns (Player Core,
  Conditions). The rules do not say, for an effect one creature puts on another,
  whose turn counts the rounds.
- **The ambiguity:** an effect "for 3 rounds" that a goblin puts on you could run
  on the goblin's clock, yours, or from the moment it was applied.
- **Our reading:** a `rounds` duration ticks at the **start of the bearer's own
  turn** (the one who has the condition), and ends when it reaches zero, so "1
  round" lasts until the start of your next turn. *Frightened* drops by 1 at the
  **end of the bearer's turn**, and ends at zero, including a frightened that was
  applied during that same turn.
- **Alternative reading:** tick on the clock of whoever applied it, which the app
  would need the condition's source to know (a field this milestone does not add).
- **Why:** the bearer is always known, and it is the reading that needs no extra
  state. A wrong tick is a condition that ends a turn early or late, which the GM
  sees and fixes by editing the duration.
- **Override:** the GM sets or removes any condition and edits its duration
  (`setCondition`). Every tick and drop is reported as an event the table sees.
- **Golden test:** `systems/pf2e/src/rules/turnBoundaries.test.ts`.

### The Multiple Attack Penalty resets at the start of your own turn
- **Rules text:** the penalty applies to the attacks you make on **your turn**
  (-5 on the second, -10 on the third and later, -4 and -8 with an agile weapon).
  **(confirm)** The Archives of Nethys page could not be reached from the
  environment this was written in (2026-10-02), so what follows is from memory.
- **The ambiguity:** whether an attack made on someone else's turn as a reaction
  counts toward the penalty or takes it.
- **Our reading:** the attack count lives on the combatant and **resets at the start
  of that combatant's own turn**. A strike made as a reaction on another's turn takes
  no penalty and is not counted (the server's strike operation, B.4, honours that).
  It does not reset on a new round while another creature is acting.
- **Alternative reading:** a rolling count that resets after a full turn passes, or
  that counts reaction attacks too.
- **Why:** it is the plain reading of "on your turn", and the count is one number
  the table can see and the GM can set.
- **Override:** the GM or the player sets the attack number on a strike directly,
  as they can today (`actor.rollStrike` keeps an explicit number).
- **Golden test:** `turnBoundaries.test.ts`, "the turn resets". Clear the
  **(confirm)** here and in `action-economy.md` when the page can be checked.

### Initiative ties
- **Rules text:** initiative is a Perception check (or another skill the activity
  names), and everyone acts from highest to lowest. The rules say what to do when
  results tie, but **(confirm)**: the Archives of Nethys page could not be reached
  from the environment this was written in (2026-10-02), so the wording below is
  from memory and has not been checked against it.
- **The ambiguity:** as remembered, a player character acts before a monster that
  tied them, and players who tie decide among themselves. Neither says what to do
  for monsters that tie each other, or for two players who have not decided, and an
  app needs one answer that is the same on every screen.
- **Our reading:** a player character goes before a monster with the same
  initiative. Past that, whoever joined the combat first goes first, then the
  smaller id, so the order is fixed and never depends on how a list arrived.
- **Alternative reading:** break every tie by the initiative *modifier* (higher
  first), as some tables do, or let the GM place tied creatures freely.
- **Why:** "players before monsters" is the common table reading, and the later
  tie-breaks only have to be stable. A tie among players is theirs to settle, and the
  GM's override below does that.
- **Override:** the GM sets any combatant's initiative directly (`combat.setInitiative`,
  milestone 5's server stack), so a tie the table settles differently is one number
  changed. The order is derived, so nothing else needs fixing.
- **Golden test:** `systems/pf2e/src/rules/initiativeOrder.test.ts`, "sortByInitiative".
  Clear the **(confirm)** here when the page can be checked.

### Two sources of a condition keep the longer duration
- **Rules text:** Player Core says that if you are subject to the same valued
  condition from more than one source, you use the **highest** value. It does not
  say what happens to the *duration* when two sources overlap, or how a 3-round
  effect compares with a 10-minute one.
- **The ambiguity:** each source plausibly runs on its own clock, and a table that
  tracks them separately would see the shorter one end first, leaving the other.
- **Our reading:** a character holds one entry per condition (the model since
  milestone 3), so the entry with the higher value brings its own duration. On an
  equal value, or a condition with no value, the **longer-lasting** duration is
  kept. Durations are compared in seconds: a round is 6, a `turn` counts as one
  round, `sustained` as a minute, `untilRemoved` (or no duration) as forever, and
  calendar kinds at face value. A condition applied again with no duration becomes
  permanent.
- **Alternative reading:** track each source separately, so a lower *frightened*
  from a longer effect returns when the higher one ends.
- **Why:** it matches the single-entry model with no new state, and a wrong number
  here is a *longer* condition the GM can see and remove, not a hidden one.
- **Override:** `setCondition` sets the value and the duration exactly, and
  `removeCondition` removes it.
- **Golden test:** `conditionMerge.test.ts`, "durations".

### Distance between tokens counts diagonals the same way
- **Rules text:** Player Core's Grid Movement counts the first diagonal square
  of a turn as 5 feet, the second as 10, alternating, tracked across all the
  movement of a turn. Its Size, Space, and Reach section gives each size's space
  (Large 10 feet, Huge 15, Gargantuan 20 or more).
- **The ambiguity:** those pages are about *movement* and *space*. They do not
  say whether the alternating count also applies when measuring range or reach
  to a target, nor how reach is counted to a creature that fills several squares.
- **Our reading:** `SquareGrid.distanceBetween` counts the squares separating the
  two tokens' nearest occupied squares, with the same 1-2-1 rule, starting
  fresh. Two adjacent tokens are 5 feet apart, diagonals included, and two
  tokens two squares apart diagonally are 15 feet.
- **Alternative reading:** count every diagonal as 5 feet for range and reach
  (the "uniform diagonals" variant, or the older habit of measuring distance
  as the longer axis), which makes a knight's-move target 10 feet away instead
  of 15.
- **Why:** most tables measure range the way they measure movement, and one
  rule is easier to explain on the map ("the ruler says 15"). Revisit if
  milestone 5's reach and area checks show a case where it is wrong.
- **Also decided:** Gargantuan is a 4x4 footprint as a **minimum**; the real
  space is "20 feet or more", so a larger creature's token size is raised by
  hand. A path's diagonal count is per path until the combat tracker can reset it
  per turn (milestone 5).
- **Golden test:** `systems/pf2e/src/rules/squareGrid.test.ts` ("counts the
  alternating rule between two tokens", "measures a Large token to its nearest
  square"). The shared contract is `packages/core/src/grid/contract.ts`.
- **Override:** none yet; distance is shown, never applied. When reach and area
  automation arrive (milestone 5), the GM confirms targets (`docs/grid.md`).

### A monster's strike attribute is inferred from its traits
- **Rules text:** clumsy lowers Dexterity-based checks and DCs, and enfeebled
  lowers Strength-based ones, including Strength damage (Player Core, Conditions,
  checked on Archives of Nethys 2026-09-30). A PC's weapon says which attribute it
  uses; a creature's strike is a finished attack bonus and damage line.
- **The ambiguity:** a creature's strike entry does not record the attribute, so
  whether clumsy or enfeebled lowers it is not stated anywhere in the data.
- **Our reading:** ranged and thrown strikes (a `range-increment-*`, `ranged`,
  or `thrown` trait) count as Dexterity to hit; a `finesse` strike counts as
  Dexterity when the creature's Dexterity is higher than its Strength; everything
  else is Strength. Enfeebled's damage penalty applies to melee and thrown
  strikes, not to other ranged ones.
- **Alternative reading:** treat every monster strike as unaffected by attribute
  conditions (the printed bonus is final), or give each strike an explicit
  attribute at import time.
- **Why:** most monster strikes are plain melee, and the inference matches how a
  PC's weapon is treated, so a clumsy goblin archer and a clumsy goblin with a
  dagger come out the way the table expects. The importer does not carry the
  attribute, and guessing silently is worse than a stated rule.
- **Golden test:** `systems/pf2e/src/rules/prepareNpc.test.ts` ("strike
  attributes and traits").
- **Override:** the GM can set or remove any condition directly, or edit the
  creature's copy (`system.creature`) to change the printed numbers.

### Burst and emanation origin points
- **Rules text:** **(confirm)**. The Archives of Nethys pages could not be
  reached from the environment this was written in (2026-10-02), so this is
  from memory of Player Core and unverified.
- **The ambiguity:** a burst is placed by a point of origin, but the rules
  distinguish a grid intersection, a corner, and the centre of a square as
  different legal origins, and which one a caller passes is not settled here.
- **Our reading:** `GridStrategy.burst` snaps its `origin` to the nearest
  1-square cell, the same way a token snaps, and measures from that cell's
  centre. A caller that wants a burst centred on an intersection snaps to that
  intersection itself before calling; the method does not distinguish them.
- **Alternative reading:** accept a raw point and measure from it directly
  without snapping (letting a burst originate anywhere, not only cell centres),
  or add a second parameter for which kind of origin was meant.
- **Why:** one snap rule, shared with every other point this app already
  snaps, is simpler than branching on origin kind for a case the rules text
  cannot currently confirm needs it.
- **Override:** `template.place` snaps a burst's or cone's origin as above, so a
  GM who wants a different square places it there. Revisit this entry if play
  shows callers need an unsnapped origin.
- **Golden test:** `systems/pf2e/src/rules/squareGrid.test.ts`, "burst" and
  "emanation". Clear the **(confirm)** here and in `grid.md` when the pages can
  be checked.

### Cone and line coverage: a centre-point test, not a diagonal count
- **Rules text:** **(confirm)**. The Archives of Nethys pages could not be
  reached from the environment this was written in (2026-10-02), so this is
  from memory of Player Core and unverified.
- **The ambiguity:** the rules say a cone or line affects "all squares"
  within its drawn shape, but do not spell out the test for a square that the
  shape only partly overlaps -- whether any overlap counts, a majority of the
  square's area must be covered, or only the square's centre matters.
- **Our reading:** `GridStrategy.cone` and `line` test whether a cell's
  **centre point** falls inside the shape (the angle-and-distance test for a
  cone, the perpendicular-distance-and-projection test for a line), in real
  pixel space -- never `distanceBetween`'s diagonal count, which answers a
  different question (how far apart two tokens are, not which squares a drawn
  shape covers).
- **Alternative reading:** an overlap-area test (any square the shape touches
  at all, or more than half of), which several other VTTs use and which looks
  more generous at a template's edge.
- **Why:** a centre-point test is the simplest rule that is still "a square is
  either affected or it is not," with no area-fraction threshold to pick, and
  it matches how `cellsUnder` already treats a footprint's own coverage (by its
  covered cells, not by partial overlap).
- **Override:** the GM confirms every template's targets by hand regardless
  (`docs/grid.md`, "Templates"); a borderline square is the GM's call either
  way, since templates never auto-apply.
- **Golden test:** `systems/pf2e/src/rules/squareGrid.test.ts`, "line" and
  "cone". Clear the **(confirm)** here and in `grid.md` when the pages can be
  checked.

### Flanking: opposite sides by a relaxed straight-line test
- **Rules text:** **(confirm)**. The Archives of Nethys pages could not be
  reached from the environment this was written in (2026-10-03), so this is from
  memory of Player Core and unverified. As remembered: two allies flank a target
  when both threaten it and a line between them passes through opposite sides of
  the target's space.
- **The ambiguity:** "opposite sides" is not given a precise geometry, and the rules
  were written for adjacent squares; a reach weapon lets an ally threaten from
  farther away, and a larger target has more than one square to draw a line through.
- **Our reading:** both allies must threaten the target with their own reach, and
  their **centres** must be on opposite sides of the target's centre: the direction
  from one ally to the target and from the target to the other ally agree within
  **22.5 degrees**. That is half the angle between neighbouring squares around a
  target, so an ally one square off a straight line from farther out still counts,
  and one on the diagonal does not.
- **Alternative reading:** an exact line, with allies only on one of the eight
  squares around the target (no tolerance), or a test against the edges of a larger
  target's space instead of its centre.
- **Why:** a continuous test is the same rule at every distance a reach weapon
  can create, instead of a table of eight directions that does not extend to them,
  and a centre-based test is the simplest thing that is still symmetric. A borderline
  call is one the GM can see (off-guard names flanking as its source) and remove.
- **How it is applied (B.8):** at roll time, per strike, never stored. Off-guard from
  flanking is only against the flankers, so a condition on the target would be wrong
  for everyone else. The DC the card shows is the target's Armor Class with off-guard
  added (two lower, circumstance, so no stacking), and the card says it was
  flanking. Sides are the party and everyone else; a creature that cannot act does not
  flank; a ranged strike or a gridless scene never does; reach is natural reach only
  (a reach weapon is not modelled yet). All of these are simplifications the GM can
  override by giving the roll's `dc` directly.
- **Override:** the GM gives `dc` on the roll, or removes the condition by hand,
  or sets it when the app does not (`setCondition`).
- **Golden test:** `systems/pf2e/src/rules/flanking.test.ts` (the geometry) and the
  `flanking a target` block in `apps/server/src/strikeRolls.test.ts` (the effect). Clear the **(confirm)**
  here and in `grid.md` when the pages can be checked.
