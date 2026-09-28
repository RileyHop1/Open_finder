# Architecture Decision Records

An ADR records *why* a load-bearing choice was made, so that a year from now
nobody has to reverse-engineer the reasoning from the code — or worse, re-argue
it from scratch.

## When to write one
Write an ADR when a choice would be expensive to reverse, when it constrains
other choices, or when a reasonable contributor would ask "why this and not the
obvious alternative?" Do not write one for a choice that a comment in the code
would cover.

## Format
Copy `template.md`. Four sections, and all four are required:

- **Context** — the forces at play. What problem, what constraints, what else
  in the project depends on this.
- **Decision** — what we're doing, stated plainly in the present tense.
- **Consequences** — what this makes easy, what it makes hard, and what we've
  now committed to. Include the bad parts; an ADR with only upsides is marketing.
- **Alternatives considered** — **at least one**, each with the reason it was
  rejected. An ADR with no alternatives is an assertion, not a decision.

## Status
Each ADR is `Proposed`, `Accepted`, `Superseded by NNNN`, or `Deprecated`.
Never edit the substance of an accepted ADR: write a new one that supersedes it
and link both ways. The record of a decision we later reversed is more useful
than a tidy file.

## Index
| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-stack.md) | Stack: TypeScript, Fastify, Vue 3, PixiJS | Accepted |
| [0002](0002-storage-sqlite.md) | Storage: SQLite, one database file per world | Accepted |
| [0003](0003-rules-data-licensing.md) | Rules data: import only ORC/Remaster content | Accepted |
| [0004](0004-rule-elements.md) | Rule elements: our own schema, a mapped v1 subset | Accepted |
| [0005](0005-concurrency.md) | Concurrency: operation log, authoritative server | Accepted |
| [0006](0006-content-scope-core-books.md) | Content scope: the core four books only | Accepted |
| [0007](0007-seats-not-accounts.md) | Seats, not accounts: no authentication | Accepted |
| [0008](0008-modifier-resolution.md) | Modifier resolution: compute an explained total | Accepted |
| [0009](0009-node-sqlite.md) | Storage driver: `node:sqlite`, not `better-sqlite3` | Accepted |
| [0010](0010-distribution.md) | Distribution: the GM never opens a terminal | Accepted |
