# docs

Design notes and specifications. CLAUDE.md is the charter — what we are building
and the rules we hold ourselves to. These pages are the *how*, in enough detail
to implement from.

If a page and CLAUDE.md disagree, CLAUDE.md wins and the page is a bug.

## Cross-cutting systems
| Page | What it covers | Milestone |
| --- | --- | --- |
| [dice.md](dice.md) | Expression grammar, fortune/misfortune, degrees of success, damage and crits, the structured result shape | 0–1 |
| [conditions.md](conditions.md) | Condition shape, valued vs. binary, durations, the dying chain, Remaster naming | 3, 5 |
| [action-economy.md](action-economy.md) | Three actions, reactions, MAP, and the display-and-warn rule | 5 |
| [grid.md](grid.md) | Square grid, PF2e diagonals, token size, reach, flanking, templates | 4–5 |
| [operations.md](operations.md) | The client-to-server operation vocabulary, the broadcast envelope, permission resolution | 1 |
| [modifiers.md](modifiers.md) | Modifier and Statistic shapes, predicates, the stacking-rule resolver | 2 |
| [rule-elements.md](rule-elements.md) | The rule-element schema, the v1 subset, the inert fallback | 2 |
| [rulings.md](rulings.md) | Every rules judgment call we have made, and why | ongoing |

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
| [chatMessage.md](chatMessage.md) | `ChatMessage` — the first concrete document type: plain messages and dice rolls |

## Writing a page here
- Specify, do not narrate. Someone should be able to implement from it.
- Mark anything you are not certain of with **(confirm)** and the book to check.
  A confident wrong spec is worse than a flagged uncertain one.
- End with a testing section. If you cannot say how it is tested, it is not
  specified yet.
- Update the page in the same PR as the code it describes.
