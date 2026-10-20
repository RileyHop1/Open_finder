# Class resources

Pools a class spends during the day and refills at its daily preparations, and what it
makes then. In the core books' level 1 builds only the **Alchemist** has any; the rest of
its alchemy (the formula book and one-click Quick and Advanced Alchemy) comes in the next
PR of milestone 8(c).

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
