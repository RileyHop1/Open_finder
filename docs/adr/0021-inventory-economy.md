# 0021. Coins are a field, Bulk is computed, transfers are one operation

- **Status:** Accepted
- **Date:** 2026-10-05
- **Depends on:** ADR 0014 (actor document shape), ADR 0006 (content scope)

## Context
Milestone 7 ("Loot and inventory") needs money, item weight, and a way to move
loot between a character, another character, and the party. None of the three
exist today: `GearEntry` carries nothing beyond the shared envelope (no price,
no Bulk), there is no field anywhere for coins, and the only operations that
touch a character's items are `actor.addItem` (always from the compendium),
`actor.updateItem` (equipped/quantity only), and `actor.removeItem` -- none of
which can move an item *to* another actor, only off of this one.

Three questions need settling before any schema or operation gets written:
how money is represented, how Bulk and encumbrance are computed, and what a
"give this to someone" action actually is as an operation.

## Decision

### Coins are a field, not an item
A character and the party stash each get a `coins {pp, gp, sp, cp}` field,
not a gear item with a quantity. Spending calls one function that converts
the whole purse to copper, subtracts, and converts back to the fewest coins
(largest denomination first) -- "making change" is this conversion, not a
rule the player manages by hand. `pp`/`gp`/`sp`/`cp` are all non-negative
integers; a negative result is rejected by the operation (ADR 0005's
"clients send operations, the server validates").

### Prices are stored in copper
`GearEntry`, `WeaponEntry`, and `ArmorEntry` get an optional `priceInCopper`
(a single non-negative integer), computed once at import time from upstream's
`{value: {pp, gp, sp, cp}}` shape. One integer is easier to total ("how much
is in this backpack") and to compare ("can they afford this") than a
four-field struct, and the display format (gp and sp, usually) is a pure
function of the integer, never stored.

### Bulk is a number on the item, encumbrance is computed, never stored
Each item gets an optional `bulk` (a number: a *light* item is `0.1`,
*negligible* is `0`, see `docs/content/weapon.md`'s existing bulk notes
**(confirm against GM Core for non-combat gear)**). A character's total Bulk,
encumbered threshold, and maximum are **computed from carried items and
coins**, the same way AC or a skill total is computed from modifiers (ADR
0008) -- never written to the document, so there is nothing to keep in sync
when an item is added, removed, or a character's Strength changes.
Encumbered is surfaced as a condition the server adds and removes
automatically as Bulk crosses the threshold, same as any other condition, and
the GM can clear or reapply it by hand (CLAUDE.md's override-path rule): the
computed value is a recommendation, the condition is the actual game state.

### One `inventory.transfer` operation for any item or coins, between any two holders
A single operation, not a family of "give", "take", and "deposit" operations,
moves an item (optionally splitting a stack by quantity) or an amount of coins
from one holder to another, where a holder is a character's inventory or the
party's stash. The server checks that the caller owns the source holder or is
the GM, that the source actually has enough of what is being moved, and
applies both sides in one transaction -- there is never a moment where an
item or coin amount exists on neither side or on both. This is the same shape
`actor.applyDamage` already uses for "subtract from one place, the result is
visible everywhere at once," generalized to two arbitrary holders instead of
one fixed actor.

### Consumables are a sub-shape on `gear`, not a new content kind
A `consumable` field on `GearEntry` (category, remaining uses, and an
optional spell reference for scrolls and wands) rather than a `potion`/
`scroll`/`wand` kind, because nothing about permissions, search, or the
inventory panel needs to tell a potion from a suit of armor at the type
level -- only "does this have a Use button" (whether `consumable` is
present), which is exactly what an optional field already expresses.

## Consequences
- Every place that reads "how much does this character have" (the sheet,
  the stash panel, a future shop) reads one `coins` field, never adds up gear
  items tagged as currency.
- Bulk and encumbrance recompute automatically on every change (an item
  added, a coin spent, a Strength boost from the future wizard) with no
  migration and no risk of a stale cached total, at the cost of walking the
  full item list on every statistic resolve -- acceptable at the "a handful
  of items per character" scale this project targets (see Targets and
  budgets: the 200ms sheet-open budget).
- `inventory.transfer` is the only path that moves loot, so a future shop or
  crafting feature reuses it instead of inventing a second way to move an
  item between two holders.
- A scroll or wand's `consumable.spell` reference means a loot item can point
  at a spell the importer did not import (an out-of-scope spell, or one
  dropped for a missing dependency); the importer resolves this the same way
  it resolves any other cross-entry reference (ADR 0011): drop the reference,
  keep the item as a plain consumable with no linked spell, same as any other
  "excluded content is excluded whole" case in CLAUDE.md's Rules data section.

## Alternatives considered

### Coins as gear items with a quantity
Rejected: "pay 3 gp 5 sp" would mean adding and removing four separate item
stacks and hand-computing change, and a search for "how much gold does the
party have" would mean summing across four item rows per holder instead of
reading one field. Money is a quantity, not a thing you carry alongside your
sword; representing it as a thing fights every operation that touches it.

### Storing a cached `encumbered: boolean` or a cached total Bulk on the character
Rejected for the same reason ADR 0008 computes statistics instead of storing
them: any stored derived value needs to be invalidated on every input change
(item add/remove, quantity edit, a future Strength boost) and a missed
invalidation site is a silent wrong number -- exactly the failure mode
CLAUDE.md's "a wrong number the player trusts is worse than a visible gap"
rule warns about. Computing it fresh on every resolve costs a list walk over
a small array and buys correctness with no synchronization code to get wrong.

### Separate `give`, `take`, and `deposit` operations
Rejected: all three are "move N of item/coins from holder A to holder B,"
differing only in which holder is the caller's own actor. A single
parameterized operation means one server-side authorization check (does the
caller own the source) and one transaction shape to test, instead of three
near-duplicate code paths that could drift out of sync with each other as
loot features grow.

### A `potion` / `scroll` / `wand` content kind, separate from `gear`
Rejected: the importer, the search endpoint, and the inventory panel would
all need a kind-dispatch that does nothing differently for a potion than for
a suit of armor except "show a Use button," which is already exactly what
checking for the presence of a `consumable` field gives for free, without a
parallel schema and mapper to keep in sync with `gear.ts`'s.
