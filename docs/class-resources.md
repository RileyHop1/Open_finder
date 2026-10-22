# Class resources

Pools a class spends during the day and refills at its daily preparations, what it
makes then, and the formula book it makes things from. In the core books' level 1
builds only the **Alchemist** has any. The buttons that make items from the formula book
come in the next PR of milestone 8(c); the operations they send are below.

The design line is CLAUDE.md's: calculate and offer, never enforce (ADR 0023). The sheet
keeps the count and works out the size, so nobody has to add 2 and an Intelligence
modifier in their head; it does not decide when a vial may be used.

## The rule

`systems/pf2e/src/rules/classResources.ts`, our own authored data (the upstream
`SpecialResource` and `CraftingAbility` rule elements are not in our subset):

| Class | Pool or crafting | Size | Back outside daily preparations |
| --- | --- | --- | --- |
| Alchemist | Versatile vials (`versatile-vials`) | 2 + Intelligence modifier | 2 for every 10 minutes of exploration |
| Alchemist | Advanced Alchemy (made at daily preparations) | 4 + Intelligence modifier infused items | -- |

`classResources(data)` returns each pool with its derived size, the size in effect, what is
spent, what is left (never below 0) and how far past the maximum it was spent.
`dailyCrafting(data)` returns the Advanced Alchemy count. The class is read from the
character's class reference: its compendium source's slug, else its name, so a
hand-built "Alchemist" gets its vials too. Sizes never go below 0.

## What is stored

`CharacterData.resources`: a record by pool key of `{ used, max? }`, default empty. Only
what is spent is stored, so a pool's size follows Intelligence at once. `max`, when
set, overrides the derived size: the GM's override path for a feat or a ruling. An
older actor parses as nothing spent. The sheet changes it with `actor.update`
(`system.resources.<key>.used`, `system.resources.<key>.max`; `null` clears the
override), like the focus pool.

## On the sheet

`ClassResourcesPanel.vue`, at the top of the Inventory tab, shows each pool as pips and
in words ("3 of 4 left"), with **Use one**, **Regain 2** and **Refill** (daily
preparations) buttons, and a Maximum field whose placeholder is the derived size (empty
means derived). Using one past the last is never disabled: the count reads "-1 (1 over
the maximum)". Below the pools it says how many infused items Advanced Alchemy makes each
day; adding them to the inventory is by hand until the next PR. Read-only for someone who
cannot edit the character. A class with no resources shows nothing.

## The formula book

`CharacterData.formulas`: the alchemical items a character knows how to make, each
`{ source: { packId, slug }, name, level? }`, default empty. A reference, not a copy:
the name and level are kept so the book reads without a lookup, and making an item
copies it from the compendium then. The sheet saves the whole list with `actor.update`
(`system.formulas`).

`formulaBookSize(data)` is how many formulas the class starts its book with at its
level: an Alchemist's 8 at level 1 (4 from Alchemical Crafting, 2 from its research
field, 2 of its own) and 2 more each level after. It is a guide, never a limit.

`FormulaBookPanel.vue`, below the pools on the Inventory tab, lists the formulas by
level with **Remove**, counts them against `formulaBookSize` for an Alchemist ("6 of 8
formulas", and how many past the start), and searches the compendium for alchemical items
(`trait=alchemical`; item summaries carry their level) to **Add**. An item above the
character's level can be added, with a note to check with the GM; one already in the book
says so. Any character with formulas sees the book; a class with no book and no formulas
does not.

## Making items and daily preparations

Two operations do the bookkeeping, and check nothing against the rules (ADR 0023):

- **`actor.makeAlchemy`** copies an item from the server's compendium onto the character
  as an **infused** item: `infused: 'daily'` for Advanced Alchemy, or with `quick`,
  `infused: 'quick'` for Quick Alchemy, which also spends one versatile vial (past the
  last one too: the pool reads as over its maximum). Neither checks the formula book,
  the item's level, or how many were made today.
- **`actor.dailyPreparations`** does a character's daily preparations at once: every
  spell slot available again (as `actor.restSpells`), the focus pool full, every class
  resource pool refilled (a hand-set maximum kept), and every infused item from the day
  before gone. Ordinary items are untouched.

Both live in `apps/server/src/alchemy.ts`.

