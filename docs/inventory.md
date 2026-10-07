# Inventory, coins, and Bulk

Money, item weight, and moving loot between a character, another character,
and the party, per [ADR 0021](adr/0021-inventory-economy.md). This page
specifies the shape; [actor.md](actor.md) and [party.md](party.md) own the
documents these fields live on.

## Coins

A character's `system.coins` and the party's `system.stash.coins` are both
`{pp, gp, sp, cp}`: non-negative integers, default all `0`. Nothing else in
the data model represents money -- a gear item is never currency (ADR 0021's
"coins as a field" decision).

**Spending** always resolves to the fewest coins: convert the whole purse to
copper (`pp * 1000 + gp * 100 + sp * 10 + cp`), subtract, then reassemble
greedily from the largest denomination down. A character or the stash can
never go negative; the operation rejects a spend it cannot cover rather than
leaving a partial deduction.

| Denomination | Copper value |
| --- | --- |
| Platinum (pp) | 1000 |
| Gold (gp) | 100 |
| Silver (sp) | 10 |
| Copper (cp) | 1 |

**On the sheet** (`CoinsRow.vue`, inside the Items panel): the purse reads as four
denominations. An owner or the GM also gets a small form: type what moved in any
denominations and choose **Add** or **Spend**. It sends one `actor.adjustCoins`
with the signed change; the server makes change, and refuses a spend the purse
cannot cover with a message in the table's alert (arithmetic, not a ruling).

**Giving** (`GiveMenu.vue`): an owner or the GM gets **Give…** on each item and on
the coins row. It opens a small inline form: pick a recipient (the other
characters, then the party stash), and for a stack of two or more how many, or
for coins how much of each denomination. It sends one `inventory.transfer`
(`from` the selected character); the server checks they actually have it, and the
recipient needs no consent. Escape cancels. Taking from the stash and the GM's
loot hand-out are separate (PRs 15 and 16).

**The party stash on screen** (`PartyStashPanel.vue`, under a character's items on
their sheet): everyone at the table sees the shared purse and items. Players put
things in with **Give…** ("Party stash" is a recipient). Taking out is the GM's call,
as the server requires for any stash change: the GM can **Give…** an item (or part of
a stack) or coins to any party member, or **Split evenly**, which sends each member
an equal portion of the coins (worked out in copper, with change made) and leaves
any remainder in the stash. The split is one `inventory.transfer` per member.

**Hand out loot** (`LootHandout.vue`, in the GM's **Manage party** drawer): the GM picks
a recipient (a party member or the party stash), then either gives coins in any
denominations or searches the compendium and gives an item with a stack size. It
sends `actor.addItem` / `actor.adjustCoins` for a member and `party.addItem` /
`party.adjustCoins` for the stash; the server copies the item from its own compendium,
so only an entry and a recipient are named. The status line says what was given only
once the server accepted it.

## Item price and Bulk

`WeaponEntry`, `ArmorEntry`, and `GearEntry` each get two new optional fields:

| Field | Type | Notes |
| --- | --- | --- |
| `priceInCopper` | non-negative integer, optional | One integer, not a struct; display splits it back into denominations. Absent means the importer could not read a price |
| `bulk` | number, optional, default `0` | `0.1` for a *light* item, `0` for negligible. Absent is treated as `0` (no weight), not as "unknown" -- most adventuring gear genuinely has none |

## Bulk and encumbrance

Total Bulk is **computed**, never stored: sum every carried item's
`bulk * quantity`, plus one Bulk per 1,000 coins held (any denomination,
summed before converting). It is resolved alongside the rest of a
character's statistics (ADR 0008), so a change to an item, a quantity, or a
future Strength boost is reflected the next time the sheet reads it, with
nothing to invalidate.

- **Encumbered** at more than `5 + Strength modifier` Bulk.
- **Maximum carry** is `10 + Strength modifier` Bulk **(confirm against GM
  Core: whether exceeding maximum is a hard block or a GM call)**.

Crossing the encumbered threshold adds the `encumbered` condition
automatically; dropping back below removes it. Like any other condition, the
GM can add or remove it by hand -- the computed threshold decides what the
server does automatically, not what the character's actual state is allowed
to be.

## Consumables

A `GearEntry` may carry a `consumable` field:

| Field | Type | Notes |
| --- | --- | --- |
| `category` | `'potion' \| 'elixir' \| 'scroll' \| 'wand' \| 'talisman' \| 'ammo' \| 'other'` | |
| `uses` | `{current, max}`, optional | Absent means single-use (equivalent to quantity 1 of this stack being consumed) |
| `spell` | `{packId, slug, rank}`, optional | What a scroll or wand casts. Only present when the spell was actually imported -- see Importer notes |

Using a consumable (`actor.useItem`) decrements `uses.current` (or the
item's `quantity` when there is no `uses`), and posts a `ChatMessage` with
the item's name and rules text. If its text contains a dice expression, that
message's structured roll data is filled the same way any other roll is
(see [dice.md](dice.md)) -- using a consumable is not a new kind of roll,
just a new trigger for one. Anything the roll should *do* (heal HP, remove a
condition) still goes through the existing operations for that (`actor.heal`,
`actor.removeCondition`); `useItem` only spends the item and posts the card.

## Transfers

`inventory.transfer` moves one of:
- an item (by id, with an optional `quantity` to split a stack), or
- an amount of coins (`{pp?, gp?, sp?, cp?}`),

from one holder to another, where a holder is `{kind: 'actor', actorId}` or
`{kind: 'party'}` (the stash). The caller must own the source holder's actor,
or be the GM; the GM can move anything. The server checks the source actually
has what is being moved, then applies both sides inside one transaction --
see [operations.md](operations.md) for the envelope this follows.

## Importer notes

Price and Bulk are read from upstream's existing `system.price` / `system.bulk`
fields at import time; a missing or malformed one is left absent (counted in
the coverage report, not a dropped entry -- a gear item with no listed price
is still useful without one).

A scroll or wand's spell reference follows the same "excluded content is
excluded whole" rule as any other cross-entry link (ADR 0011, CLAUDE.md's
Rules data section): if the target spell was not imported (out of scope, or
itself dropped), the consumable keeps its `category` and loses `spell`
entirely, rather than carrying a reference to nothing.

## Testing

- `systems/pf2e/src/rules/coins.test.ts`: conversion to/from copper, making
  change, rejecting an overspend.
- `systems/pf2e/src/rules/bulk.test.ts`: the formula (items, quantity, coins
  by raw count) and both thresholds in both directions. One case in
  `prepareCharacter.test.ts` exercises the real `CharacterData` path; Bulk's
  formula does not vary by class, so it is not duplicated across the golden
  set the way a save or a skill is.
- `packages/core/src/operation.transfer.test.ts`: an item split across two
  holders, a coin transfer, rejecting a transfer the caller does not own and
  one the source cannot cover.
- `packages/core/src/operation.useItem.test.ts` and
  `chatMessage.itemUse.test.ts`: the operation's payload shape, and the
  `itemUse` card with and without a rolled formula.
- `apps/server/src/useItem.test.ts`: spending a single-use consumable down
  to removal, decrementing a multi-use one without removing it, refusing an
  empty wand's last charge, and the owner/GM permission check.
- Playwright e2e (`test/m7-loot-e2e`, tracking issue
  [#254](https://github.com/RileyHop1/Open_finder/issues/254)): give, take,
  and use, across two browser contexts.
