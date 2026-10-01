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
  covered condition and the "contributes nothing" set. Golden character cases
  land in the next Stack A test PR (A.8); until then this entry is pinned by
  unit tests only.
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
  a second condition implies it."
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
  case. Pinned by unit tests only until the golden set is routed through
  `prepareCharacter` (A.7).
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
  Unit tests only until the golden set is routed through `prepareCharacter` (A.7).
- **Override:** add a manual attack modifier, or equip the weapon as another entry.
  A melee-and-thrown weapon used the other way is the known gap.
