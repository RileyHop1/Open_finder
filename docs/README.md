# docs

Design notes and specifications. CLAUDE.md is the charter — what we are building
and the rules we hold ourselves to. These pages are the *how*, in enough detail
to implement from.

If a page and CLAUDE.md disagree, CLAUDE.md wins and the page is a bug.

## Cross-cutting systems
| Page | What it covers | Milestone |
| --- | --- | --- |
| [dice.md](dice.md) | Expression grammar, fortune/misfortune, degrees of success, damage and crits, the structured result shape | 0–1 |
| [conditions.md](conditions.md) | Condition shape, valued vs. binary, which conditions change a number, adding and setting them, durations and the dying chain (5), Remaster naming | 2, 3, 5 |
| [action-economy.md](action-economy.md) | Three actions, reactions, MAP, and the display-and-warn rule | 5 |
| [grid.md](grid.md) | Square grid, PF2e diagonals, token size, reach, flanking, templates | 4–5 |
| [operations.md](operations.md) | The client-to-server operation vocabulary, the broadcast envelope, permission resolution, who receives what | 1, 3 |
| [modifiers.md](modifiers.md) | Modifier and Statistic shapes, predicates, the stacking-rule resolver | 2 |
| [rule-elements.md](rule-elements.md) | The rule-element schema, the v1 subset, the inert fallback | 2 |
| [importer.md](importer.md) | The pin, fetch, verify, and re-pin procedure; grows as the importer does | 2 |
| [content-import.md](content-import.md) | The GM's in-app "Import game content" button: the routes, the child process, reloading without a restart | 3 |
| [content-model.md](content-model.md) | Rarity, proficiency rank, attribute, action cost, and trait slugs | 2 |
| [golden-tests.md](golden-tests.md) | The golden fixture format, the harness, and determinism via seeded dice | 2 |
| [rulings.md](rulings.md) | Every rules judgment call we have made, and why | ongoing |
| [rules-reference.md](rules-reference.md) | `RichText`, tooltips, the reference book's own-words pages and term syntax, the Rules drawer | 6 |
| [inventory.md](inventory.md) | Coins, item price and Bulk, encumbrance, consumables, and the transfer operation | 7 |

## Decisions
[adr/](adr/) — Architecture Decision Records. Start with
[adr/README.md](adr/README.md) for the index and the format.

## Document types
One page per document type (fields, permissions, examples), written as each type
lands.

| Page | What it covers |
| --- | --- |
| [documents.md](documents.md) | The shared envelope every document extends — not a type itself, but read this first |
| [world-and-seats.md](world-and-seats.md) | `World` and `Seat` — also not document types; the two other top-level schemas |
| [chatMessage.md](chatMessage.md) | `ChatMessage` — plain messages, dice rolls, and the structured sheet rolls (checks, strike attacks and damage) |
| [compendium.md](compendium.md) | `CompendiumEntry` and pack manifests — also not a document type; a read-only import source (milestone 2) |
| [actor.md](actor.md) | `Actor` -- the system-agnostic envelope; the system payload is opaque to core (milestone 3) |
| [party.md](party.md) | `Party` -- ordered members, the party level, and the scene it is in (milestones 3-4) |
| [scene.md](scene.md) | `Scene` -- a map, its grid, and exits to other scenes (milestone 4) |
| [token.md](token.md) | `Token` -- one actor's marker on a scene (milestone 4) |
| [template.md](template.md) | `Template` -- an area effect placed on a scene (milestone 5) |
| [combat.md](combat.md) | `Combat` and `Combatant` -- an encounter, and one token's place in it (milestone 5) |
| [assets.md](assets.md) | Content-addressed image uploads and how they are served (milestone 3) |

## PF2e content kinds (`systems/pf2e`)
One page per content kind whose fields are non-obvious enough to need a spec,
written as each lands. Simpler kinds stay documented in
[content-model.md](content-model.md) and their own TSDoc.

| Page | What it covers |
| --- | --- |
| [content/weapon.md](content/weapon.md) | `weapon` -- category, group, structured base damage, hands, range, reload |
| [content/armor.md](content/armor.md) | `armor` -- category, group, AC bonus, dex cap, check/speed penalty, strength |
| [content/spell.md](content/spell.md) | `spell` -- rank, traditions, range, area, defense, heightening; no components, no rituals |
| [content/ancestry.md](content/ancestry.md) | `ancestry`, `heritage`, `background` -- attribute boosts/flaws, versatile heritages, skill grants |
| [content/class.md](content/class.md) | `class`, `classFeature` -- proficiency progressions, key attribute options, skill grants |
| [content/creature.md](content/creature.md) | `creature` -- finished (not resolved) stat blocks, strikes, resistances/weaknesses |

## Writing a page here
- Specify, do not narrate. Someone should be able to implement from it.
- Mark anything you are not certain of with **(confirm)** and the book to check.
  A confident wrong spec is worse than a flagged uncertain one.
- End with a testing section. If you cannot say how it is tested, it is not
  specified yet.
- Update the page in the same PR as the code it describes.
