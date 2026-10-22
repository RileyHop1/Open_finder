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

### The action bar has no basic-action buttons
- **This is not a rules dispute** -- it is a scope choice, recorded here because
  it changes what a table sees without any rule dictating it.
- **The ambiguity:** PF2e has dozens of basic actions, and most depend on a
  target, a skill, or a ruling (Aid, Grapple, Trip, Seek, Ready). An earlier
  action bar hard-coded seven one-action buttons (Stride, Step, Interact,
  Delay, Ready, Take Cover, Seek) that only spent actions and rolled nothing.
- **Our reading:** no preset buttons. Every seat gets one generic action (a
  description, a cost, optional dice and a situational modifier) and the table
  rules on the rest (ADR 0023, "calculate, don't enforce"). Movement is the
  exception that stays automatic: it is arithmetic, see below.
- **Alternative:** wire the bar to the imported `actions` pack with per-action
  cost and prerequisites, or hand-pick more buttons.
- **Why:** a button that spends an action and does nothing else is the system
  pretending to adjudicate; a short list is always missing the action someone
  wants, and a long one is the simulation the project decided not to build.
- **Override:** not needed; nothing is automated here.
- **Test:** `apps/client/src/components/ActionBar.test.ts` and the generic
  action cases in `TableView.test.ts`.

### Movement spends actions per move, not by a running total
- **Rules text:** Player Core, Actions, Stride: "Your Speed determines how far
  you can go with a single Stride." Each Stride is its own action, costing 1
  action per use.
- **The ambiguity:** PF2e's own wording is unambiguous about a single Stride,
  but says nothing about how an app should charge a *drag* that covers several
  squares of continuous movement in one gesture — is that one Stride regardless
  of distance, or does crossing a Speed's worth of distance mid-drag cost a
  second one?
- **Our first implementation (superseded):** a running total for the whole
  turn (`movementUsed`), so any movement up to Speed cost 1 action regardless
  of how many separate moves it took, and crossing another Speed's worth
  (cumulative) cost a second. Playtesting found this read as broken rather than
  permissive: the same 5 ft move cost an action some of the time and nothing
  the rest of the time, depending on what else had moved that turn, including
  movement already undone.
- **Our reading (current):** each move — one drag, or one committed
  keyboard-planned path — is charged independently: `max(1, ceil(distance /
  Speed))` actions, a minimum of 1 for any nonzero distance. This matches a
  real table, where a player says "I move" once per decision, not once per 5 ft,
  and it is simpler to verify against RAW than a running total ever was.
- **Alternative reading:** the running total described above, which a GM might
  prefer as more generous for a slow character splitting movement into several
  small steps. Any GM who wants that can still allow it by hand (see Override).
- **Why:** per-move cost is exactly what the rule says and was simple enough to
  get right the first time; the running-total version was an attempt to be more
  forgiving that ended up being less predictable, which is a worse trade for a
  table than the stricter, simpler reading.
- **Golden test:** `systems/pf2e/src/rules/movement.test.ts`.
- **Override:** the GM can always spend or refund an action by hand through the
  action tray, independent of what a move actually cost.

### Spending coins always makes change from the largest denomination
- **Rules text:** Player Core, Treasure, coinage: 10 cp = 1 sp, 10 sp = 1 gp,
  10 gp = 1 pp. The books describe the conversion rate; they do not specify
  an algorithm for paying an odd amount out of a mixed purse.
- **The ambiguity:** given `{gp: 1, sp: 2}` and a 5 sp cost, there is more than
  one coin breakdown that validly deducts 5 sp of value (break the gold piece,
  or leave it alone and run short on silver).
- **Our reading:** every spend converts the whole purse to copper, subtracts,
  and reassembles the remainder greedily from the largest denomination down.
  This never leaves a payable purchase blocked just because it was not pre-
  broken into the right denominations, which is how an actual table runs a
  purse.
- **Alternative reading:** require exact denominations and reject a spend the
  current coin breakdown cannot literally cover, pushing "break a gold piece"
  onto the player as its own action. Rejected: no table actually tracks
  change this strictly, and it would block an affordable purchase on a
  bookkeeping technicality.
- **Why:** automating "making change" is strictly more convenient and changes
  no number a player would compute differently by hand.
- **Golden test:** `systems/pf2e/src/rules/coins.test.ts`.
- **Override:** the GM can set a character's or the stash's coins directly to
  any value.

### Encumbrance thresholds: 5 + Str to encumbered, 10 + Str to maximum
- **Rules text:** Player Core, Bulk: a character is encumbered when carrying
  more than 5 + their Strength modifier Bulk, and cannot carry more than
  10 + their Strength modifier Bulk at all **(confirm against GM Core: whether
  exceeding the maximum is a hard block or left to the GM)**.
- **The ambiguity:** whether exceeding the maximum should be a hard block (the
  server refuses the pickup or the transfer) or only a displayed warning the
  GM can ignore.
- **Our reading:** both thresholds are computed and shown, with the
  `encumbered` condition applied automatically above 5 + Str. Exceeding the
  maximum is a warning, not a block, on `inventory.transfer` and `actor.addItem`
  -- consistent with CLAUDE.md's "every automated result has a GM override
  path" and with not wanting a false-confirm on the Bulk math to brick a pickup
  mid-session.
- **Alternative reading:** hard-block any transfer or pickup that would exceed
  the maximum.
- **Why:** a wrong block is worse than a wrong warning -- it stops play outright
  rather than just displaying a number the GM can choose to ignore -- and a
  table that wants the hard rule enforced can still just not click through
  the warning.
- **Golden test:** `systems/pf2e/src/rules/bulk.test.ts` (the formula and both
  thresholds) plus one case in `prepareCharacter.test.ts` exercising the real
  `CharacterData` → `prepareCharacter` path. Not one case per class: unlike a
  save or a skill, Bulk's formula does not vary by class, so testing it once
  through the real pipeline, plus `bulk.ts`'s own unit tests for the edge
  cases, covers it exactly as well as 16 copies of the same arithmetic would.
- **Override:** the GM can apply or remove `encumbered` by hand regardless of
  the computed total, and nothing stops a transfer that crosses the maximum.

### Partial attribute boosts
- **Rules text:** Player Core, character creation and level advancement
  (attribute boosts). A boost raises an attribute modifier by 1; once the
  modifier is +4 or higher, a boost is a partial boost, and two partial
  boosts together raise it by 1. **(confirm)**
- **The ambiguity:** none in the text itself. The judgment is how to store
  it: as the build's list of boosts replayed in order, rather than as a
  stored half-step.
- **Our reading:** boosts are stored as choices and replayed. A modifier of
  +4 or more receives half a step per boost, and the modifier only changes
  on the second.
- **Alternative reading:** store a numeric score (10 plus 2 per boost) as
  the pre-Remaster rules did. Rejected: the project is Remaster-only
  (ADR 0003) and attributes are modifiers (ADR 0008).
- **Why:** replaying keeps the build the only record and lets level-up
  re-derive without bookkeeping.
- **Golden test:** `systems/pf2e/src/rules/boosts.test.ts` ("makes a boost at +4 or more a partial boost").
- **Override:** the attribute modifier is directly editable on the sheet.

### Boosting the same attribute twice from one source
- **Rules text:** Player Core: an attribute may not receive more than one
  boost from the same source. **(confirm)**
- **The ambiguity:** whether the app should refuse the second pick.
- **Our reading:** warn, and apply it anyway.
- **Alternative reading:** refuse the pick, as a computer game would.
- **Why:** ADR 0023. A table may rule otherwise, and a wrong refusal costs
  more than a visible warning.
- **Golden test:** `systems/pf2e/src/rules/boosts.test.ts` ("warns about the same attribute boosted twice from one source").
- **Override:** none needed, since nothing is refused.

### Starting gold
- **Rules text:** Player Core, step 8 of character creation (buy starting
  equipment): a new level 1 character has 15 gp to spend. **(confirm)**
- **The ambiguity:** none. The judgment is not blocking an over-budget
  purchase.
- **Our reading:** the wizard shows a running total against 15 gp and warns
  when it is exceeded.
- **Alternative reading:** disable the buy button at the budget.
- **Why:** ADR 0023. A GM may grant extra starting funds.
- **Golden test:** `apps/client/src/components/creator/equipmentPlan.test.ts` (one sword and two ropes cost 120 cp and leave 13 gp 8 sp). Whether the shop is limited by item level is also **(confirm)**; we do not limit it.
- **Override:** the purse and the item list are editable on the sheet.

### Feat, skill increase and boost levels
- **Rules text:** the class and ancestry advancement tables in Player Core
  and Player Core 2. **(confirm)** The levels listed in
  [character-build.md](character-build.md) are from memory of the Remaster
  tables and must be checked before the progression tables ship.
- **The ambiguity:** none intended. Recorded so a wrong level is a visible
  data fix rather than a hidden constant.
- **Our reading:** the levels in `character-build.md`, as data in
  `systems/pf2e/src/rules/progression.ts`.
- **Alternative reading:** none.
- **Why:** a table of facts, kept in one place so it can be corrected once.
- **Golden test:** lands with `feat/build-schema` (A2).
- **Override:** a player may pick a feat in any slot (a warning, not a
  refusal).


### Spell slots per rank, by level
- **Rules text:** the "Spells per Day" table of each caster in Player Core and
  Player Core 2. **(confirm)** The upstream data does not carry these tables (a
  class has only a `spellcasting` flag), so the numbers are our own authored data
  in `systems/pf2e/src/rules/spellcastingTables.ts` (ADR 0025).
- **The ambiguity:** none intended. Recorded so a wrong number is a visible data
  fix, and so what was and was not checked is written down.
- **Our reading:** a rank opens at level 1 for the first rank, `2r - 1` for rank
  `r`, and at 19 for the tenth (one slot). Standard casters (Bard, Cleric, Druid,
  Witch, Wizard) get 2 slots when a rank opens and 3 from the next level; the
  Sorcerer and the Oracle get one more of each (3, then 4). Every caster has 5 cantrips at
  level 1. Spellcasting proficiency is no longer in this table: it is each class
  feature's rank-up from the imported data (Expert Spellcaster and the rest; a
  Cleric by doctrine), which replaced a flat "expert at 7, master at 15, legendary
  at 19" that was wrong for a Warpriest (expert at 11).
- **What was checked, and against what:** the functions were run against every
  caster among the sample characters Paizo publishes in the pinned upstream pack
  (read only, nothing copied). 21 of 26 match exactly, covering the Bard,
  Cleric, Druid, Sorcerer and Witch at levels 1 to 10. The Oracle was first read as
  standard; re-checked (2026-10-19), the Remaster iconic Oracle (levels 1, 3 and 5:
  3, then 4 and 3, then 4, 4 and 3) matches the Sorcerer's style, as does the
  Remaster text ("three 1st-rank spells" at level 1), and the one Oracle sample on
  the standard style is from an older adventure, read as legacy. The five that
  differ: three Wizards and their curriculum's extra slot per rank (not in the
  base table; it arrives with the Wizard), a Cleric entry that was a different
  casting source, and one Level 1 Bard with one slot more than the other Level 1
  Bard (probably a feat; **unresolved**).
- **Not checked at all:** levels 11 to 20 (the same pattern, extended), the tenth
  rank's single slot at level 19, and spellcasting proficiency levels for any class
  other than as the class feature names show them. The repertoire sizes of the
  spontaneous casters are not here: the samples include spells from feats and
  bloodlines, so they could not be read cleanly. They arrive with their classes.
- **Alternative reading:** none known.
- **Golden test:** `systems/pf2e/src/rules/spellcastingTables.test.ts`.
- **Override:** every count is editable on the sheet once the Spells tab lands.

### What a class grants by itself (the Bard, the Druid, the Witch, the Oracle)
- **Rules text:** the Bard's Composition Spells, muse and Spell Repertoire class
  features in Player Core. Checked against the pinned upstream text (2026-10-16), not
  against Archives of Nethys, which was not reachable: **(confirm)**.
- **The ambiguity:** none intended. Upstream carries these only as prose (the muse and
  composition features have no grant elements), so they are our own data in
  `systems/pf2e/src/rules/classSpells.ts`.
- **Our reading:** a Bard starts with a focus pool of 1, the Counter Performance focus
  spell and the Courageous Anthem composition cantrip (in addition to the five picked
  cantrips). Each muse adds a spell to the repertoire: Enigma, Sure Strike; Maestro,
  Soothe; Polymath, Phantasmal Minion; Warrior, Fear. At level 1 a Bard learns two rank 1
  spells; a spontaneous caster's repertoire is read as holding as many ranked spells as
  it has slots, and the granted spells do not count against it. A Druid starts with
  a focus pool of 1 and its order's order spell: Animal, Heal Animal; Leaf,
  Cornucopia; Storm, Tempest Surge; Untamed, Untamed Shift (checked against the
  same pinned text, 2026-10-18). The Flame Order is from Rage of Elements, outside
  the core books, so it is not imported. A Witch starts with a focus pool of 1 (Hex
  Spells), and its patron decides its tradition, a hex cantrip (in addition to the
  five picked) and the spell the familiar learns (patrons and spells listed in
  `docs/spellcasting.md`; same pinned text, 2026-10-18). Upstream carries the
  patron's tradition as a Foundry-specific alias override, which we do not import;
  the mapping is ours. Every Witch picks a first hex (Patron's Puppet or Phase
  Familiar), and a Wilding Steward's familiar learns the pick of Summon Animal or
  Summon Plant or Fungus: both are picks in the spells step, never granted unmade.
- **The Oracle:** a focus pool of 1, its mystery's initial revelation spell, and its
  mystery's granted spells: a cantrip (beyond the five picked) and a rank 1 spell at
  level 1, then each higher-rank one once the Oracle can cast that rank (the Mystery
  feature's text; checked 2026-10-19). The granted spells are added to the repertoire
  and do not count against it. Its slot table was settled the same day (see "Spell
  slots per rank, by level").
- **Alternative reading:** none known.
- **Golden test:** `systems/pf2e/src/golden/deriveCasters.test.ts` ("what a class
  grants by itself") and `apps/server/src/applyBuild.test.ts`.
- **Override:** every list and the focus pool are editable on the sheet ("Edit spells").

### The Cleric's Divine Font
- **Rules text:** the Cleric's Divine Font class feature in Player Core. Checked against
  the pinned upstream text (2026-10-16), not Archives of Nethys: **(confirm)**.
- **The ambiguity:** how to model slots that hold only one spell. We make them their own
  prepared entry ("Divine Font") with the spell already prepared in each, rather than
  extra slots on the Cleric's entry that the player would have to fill with Heal by hand
  every day.
- **Our reading:** 4 extra slots at the highest rank of cleric spell slots, 5 from level
  5, 6 from level 15, holding only Heal (healing font) or only Harm (harmful font), by
  the font chosen. Which font a deity allows is not checked (deities are not imported):
  the player picks, the GM rules.
- **Alternative reading:** add the slots to the class entry and leave them to be
  prepared like any other.
- **Why:** it saves the table a daily chore and a miscount, and the font's slots are
  listed and cast apart from the rest the way the rules describe them.
- **Golden test:** `systems/pf2e/src/golden/deriveCasters.test.ts` ("a Cleric's Divine
  Font") and `apps/server/src/applyBuild.test.ts`.
- **Override:** the entry's slots and prepared spells are editable on the sheet ("Edit
  spells").

### A Sorcerer's bloodline spells fill its repertoire
- **Rules text:** the Sorcerer's Spell Repertoire, Bloodline and Bloodline Spells class
  features and the bloodlines in Player Core 2. Checked against the pinned upstream
  text (2026-10-19), not against Archives of Nethys: **(confirm)**.
- **The ambiguity:** none in the rules; recorded because the Sorcerer counts its
  granted spells differently from the Oracle and the Bard.
- **Our reading:** at level 1 a Sorcerer learns two rank 1 spells and four cantrips
  of its choice, plus a spell and a cantrip from its bloodline, so its repertoire
  holds 5 cantrips and 3 rank 1 spells (as many as its slots). At each level the
  player picks the slot count less one per rank open (to the 9th), and 4 cantrips,
  whether or not the bloodline's gifts are modeled yet (the Draconic and Elemental
  ones hang on a further choice). An Oracle's granted spells and a Bard's are on top
  of its picks instead. Each bloodline's tradition, cantrip, rank 1 spell and initial
  bloodline spell are in `docs/spellcasting.md`; a focus pool of 1.
  A Draconic sorcerer's dragon exemplar is offered as the four traditions the
  Remaster bloodline text names; upstream also lists individual dragons (Monster
  Core's and legacy ones) that each map to one of the four, which the table can
  name in play. Its tradition is the exemplar's and it trains the exemplar's skill.
- **Alternative reading:** count the bloodline's spells on top, like the Oracle's.
  Rejected: the Sorcerer's repertoire text names two picked spells plus one from the
  bloodline at level 1, matching three slots.
- **Golden test:** `systems/pf2e/src/golden/deriveCasters.test.ts` (the Sorcerer
  cases) and `systems/pf2e/src/rules/spellcastingTables.test.ts`.
- **Override:** the repertoire and cantrips are editable on the sheet ("Edit spells"),
  and more picks only warn.

### A Wizard's school: curriculum slots and school spell
- **Rules text:** the Wizard's Arcane School, Wizard Spellcasting and Archwizard's
  Spellcraft class features, the arcane schools, and the Wizard page of the classes
  journal, in Player Core. Checked against the pinned upstream text (2026-10-19), not
  against Archives of Nethys: **(confirm)**.
- **The ambiguity:** whether the extra curriculum slots are part of the Wizard's own
  slots or a list of their own, and whether the 10th rank gets one.
- **Our reading:** a school with a curriculum gives one extra cantrip and one extra
  slot at each rank the Wizard can cast, held as their own prepared entry
  ("Curriculum") so the sheet shows which slots are the curriculum's. The 10th rank
  gets none: Archwizard's Spellcraft says its slot can't be used with abilities that
  give more slots. Unified Magical Theory has no curriculum. Every school gives a
  focus pool of 1 and its initial school spell (listed in `docs/spellcasting.md`).
  The spellbook's two rank 1 curriculum spells (Unified Magical Theory: one of any
  kind) are counted with its five other rank 1 spells, as 7 (or 6) picks; the creator
  shows how many are from the curriculum but does not require it.
- **Alternative reading:** add one slot to each rank of the Wizard's own entry. Rejected
  because the restriction to curriculum spells would then be invisible on the sheet.
- **Golden test:** `systems/pf2e/src/golden/deriveCasters.test.ts` (the Wizard cases)
  and `apps/server/src/applyBuild.test.ts`.
- **Override:** the curriculum entry's slots and prepared spells are editable on the
  sheet ("Edit spells"), and nothing checks what is prepared there.

### A spellbook's or familiar's cantrips: which start prepared
- **Rules text:** Wizard Spellcasting and the Witch's Familiar class features in Player
  Core: the spellbook and the familiar start with 10 cantrips and five rank 1 spells,
  and the caster prepares five cantrips a day from them. Checked against the pinned
  upstream text (2026-10-19): **(confirm)**.
- **The ambiguity:** none in the rules; the question is what a newly built character
  has prepared before their first daily preparation.
- **Our reading:** the first five cantrips picked in the creator start prepared, and the
  other five are on the character as items to prepare instead. The Witch's hex cantrip is
  prepared on top, since it is not counted toward the five.
- **Alternative reading:** prepare none until the player does it on the sheet. Rejected
  because a new character would open with no cantrips to cast.
- **Golden test:** `systems/pf2e/src/golden/deriveCasters.test.ts` ("a book caster's
  picks").
- **Override:** the prepared cantrips are editable on the sheet ("Edit spells").

### An Alchemist's versatile vials and Advanced Alchemy
- **Rules text:** the Alchemist's Versatile Vials and Advanced Alchemy class features in
  Player Core 2. Checked against the pinned upstream text (2026-10-20), not against
  Archives of Nethys: **(confirm)**.
- **The ambiguity:** none in the numbers; recorded because they are our own data
  (`rules/classResources.ts`) rather than the upstream rule elements.
- **Our reading:** up to 2 + Intelligence modifier versatile vials, refilled at daily
  preparations, 2 back for every 10 minutes of exploration; Advanced Alchemy makes up to
  4 + Intelligence modifier infused items at daily preparations. Neither goes below 0.
  The sheet counts and offers; it never stops a vial being used, and the maximum can be
  set by hand.
- **Alternative reading:** none known.
- **The formula book:** an Alchemist starts with 8 formulas at level 1 (4 common 1st-level
  alchemical items from Alchemical Crafting, 2 from its research field, 2 of its own) and
  adds 2 each level (the Formula Book feature and Alchemical Crafting; same check). The
  sheet counts the book against that as a guide; which items qualify (common, of the
  field's kind, at or below the character's level) is left to the table, with a note on
  an item above the character's level.
- **Infused items:** everything Advanced Alchemy and Quick Alchemy make is marked infused
  and removed at the next daily preparations. That is the rule for Advanced Alchemy's
  items (potent for 24 hours or until the next preparations) and versatile vials; a
  Quick Alchemy item lasts only until the end of the alchemist's next turn, which the app
  does not track, so the table discards it when it is used or lapses.
- **Golden test:** `systems/pf2e/src/rules/classResources.test.ts`.
- **Override:** the Maximum field and the Use, Regain and Refill buttons on the sheet.

### Reading predicates on class features
- **Rules text:** none directly; this is how upstream's conditions on a class
  feature's skill training and grants are read (`classFeatureRules.ts`).
- **The ambiguity:** upstream writes some of them with a condition that names
  another route to the same feature: a Druid order trains its skill "unless gained
  through Order Explorer", a Sorcerer bloodline "unless granted by Crossblooded
  Evolution", a Druid order grants its feat "to a Druid or through Order Explorer".
- **Our reading:** a feature a character has through its own class takes the
  ordinary route, so `class:<own class>`, an `or` that names it, and a `not` of a
  feat or of a granter all hold; the skill is trained and the feat granted. Any other
  condition (a level, a curse, a deity) is not read and the element stays inert, to
  be applied by hand.
- **Alternative reading:** leave every conditioned element inert.
- **Why:** these are the common case of every Druid, Rogue, Investigator, Sorcerer
  and Swashbuckler, and the other route (a feat, an archetype) is the exception the
  GM can correct; leaving them all inert would leave every one of those characters
  short a trained skill.
- **Golden test:** `systems/pf2e/src/importer/classFeatureRules.test.ts`.
- **Override:** every skill rank is editable on the sheet.

### Casting: cantrip rank, refocus and daily preparation
- **Rules text:** the spellcasting rules in Player Core (cantrips and focus spells
  heighten, Refocus, daily preparations). **(confirm)** These are from memory; Archives of
  Nethys was not reachable when this was written.
- **The ambiguity:** whether daily preparation also refills the focus pool. We
  understand that Refocus is what regains focus points and that a new day does not top
  the pool up, so `actor.restSpells` does not touch focus points. **(confirm)**
- **Our reading:** a cantrip or focus spell is cast at half the caster's level, rounded
  up, and costs nothing (a cantrip) or one focus point; Refocus regains one point up to
  the maximum; resting makes every spell slot available again. Casting with nothing to
  spend still casts, and the card says so.
- **Alternative reading:** refuse the cast, or refill the focus pool on rest.
- **Why:** ADR 0023, and a wrong refill is worse than an adjustable gap: the GM can set
  focus points by hand.
- **Golden test:** `systems/pf2e/src/rules/castSpell.test.ts` and
  `apps/server/src/castSpell.test.ts`.
- **Override:** every count is editable on the sheet.
