# 0002. Storage: SQLite, one database file per world

- **Status:** Accepted
- **Date:** 2026-09-28
- **Supersedes:** the MongoDB choice in the original CLAUDE.md draft

## Context
The original charter proposed MongoDB, justified as "documents map naturally to
collections," shipped via Docker Compose. On review that justification does not
survive contact with the project's actual requirements.

Four forces matter here:

1. **The workload is relational, not document-shaped.** Actors own items; items
   reference compendium entries; scenes reference actors; the Party document
   references actors; permissions are queried across all of it. Document storage
   helps when data is genuinely hierarchical and read whole. Ours is a graph.
2. **Schema flexibility buys nothing.** Every document type is validated by a
   Zod schema in packages/core before it is written. A schemaless store's
   central advantage is neutralized by our own rules.
3. **Transactions are required, not nice to have.** ADR 0005 commits to applying
   each client operation atomically with a sequence number. Prep-mode undo needs
   the same guarantee. MongoDB provides multi-document transactions only on a
   replica set, meaning a self-hosting GM must run a replica set to get
   correctness.
4. **Self-hosting is a stated product goal.** The target user is a GM setting
   this up for friends. "Install Docker, then bring up a database container" is
   a real barrier for that person and a real support burden for us.

The charter's Foundry-precedent argument does not apply either: Foundry itself
uses NeDB/LevelDB, not MongoDB.

## Decision
**SQLite, via better-sqlite3. One database file per world, stored inside that
world's folder alongside its assets.** Document bodies live in JSON columns;
identity, type, parent, permissions, and schemaVersion are real columns so they
can be indexed and queried. WAL mode on. Writes go through a single Node process
and are wrapped in transactions. A Docker image stays available as a
convenience, but the app runs as one process with no external service.

## Consequences
- **Backup, export, and "move my campaign to another machine" become file
  operations.** The world folder *is* the world: copy it and you are done. This
  serves the export/import requirement in CLAUDE.md directly.
- **Transactions are free and synchronous.** better-sqlite3 is synchronous,
  which sounds wrong on Node but is the right shape here: the
  authoritative-server model already serializes operations per world, so there
  is no concurrency to overlap with, and synchronous calls remove a large class
  of interleaving bugs.
- **Zero-dependency install.** Start the server, open a browser. No container,
  no connection string, no database auth to configure.
- **We give up horizontal scaling and network-attached storage.** A world is
  served by exactly one process. That is acceptable, and consistent with
  "self-host only" in Not in v1, but it is precisely the assumption that breaks
  if a hosted multi-tenant version is ever built. That open question and this
  ADR are linked: revisiting one means revisiting the other.
- **better-sqlite3 is a native module**, so installing it needs prebuilt
  binaries or a build toolchain, and it must be rebuilt per Node major version.
  This is the main cost of the decision.
- **Migrations are on us**, as they would be with any store, but now they are
  schema migrations *and* data migrations. See the Data durability section of
  CLAUDE.md: schemaVersion per document, forward-only numbered migrations, and a
  snapshot before each run.

## Alternatives considered
### MongoDB (the original proposal)
Rejected. It requires a replica set for the transactions we need, adds a Docker
dependency that undermines the self-hosting goal, and its schema flexibility is
redundant given Zod validation on every write. "Documents map to collections"
describes a surface similarity, not a benefit.

### PostgreSQL with JSONB
Genuinely strong: real transactions, excellent JSON support, proper relational
queries. Rejected **for v1 only**, because it is still a service the GM must
run, which is the specific cost we are trying to remove. If the hosted version
in Open Questions ever happens, this is the alternative to revisit first — the
JSON-column data model here is deliberately portable to it.

### LevelDB / NeDB (Foundry's approach)
Rejected. Embedded and dependency-light like SQLite, but with no query layer:
every permission check or cross-reference lookup becomes a full scan or a
hand-maintained index. SQLite gives the same deployment story plus SQL.

### Plain JSON files on disk
Tempting for a "table for friends," and maximally inspectable. Rejected: no
atomic multi-file writes, no indexes, and a partial write during a session is
unrecoverable. The durability promises in CLAUDE.md cannot be kept on it.
