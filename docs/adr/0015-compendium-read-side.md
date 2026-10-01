# 0015. The compendium is loaded into memory at startup and served read-only

- **Status:** Accepted
- **Date:** 2026-09-30
- **Relates to:** ADR 0012 (the on-disk pack format; this is the consumer it
  deferred), ADR 0014 (actors carry embedded copies of entries), ADR 0009
  (`worldStore.ts` is the only file that imports `node:sqlite`)

## Context
ADR 0012 fixed what the importer writes and explicitly left the reader for
"whenever milestone 3 needs one." Milestone 3 needs two things from it:

- **The item picker** (character sheet) needs to search by name and kind and
  show a list, then fetch one entry.
- **Adding an item to an actor** has to copy a compendium entry onto the actor
  (ADR 0014). That copy must be made by the server, from its own data: a client
  that could send entry content could invent a weapon with any damage and any
  rule elements. So the server needs entry lookup too, not just the browser.

The data is read-only and changes only when a maintainer deliberately
re-imports (ADR 0003, ADR 0011). A pack can hold thousands of entries, one file
each.

## Decision
1. **The server loads every pack under one directory into memory at startup**
   (`apps/server/src/compendium.ts`): a `Map` keyed `packId/slug` for lookup,
   and a flat array for search. Each entry is validated with `pf2eEntrySchema` as
   it loads. The directory defaults to `systems/pf2e/.data/imported` and is
   overridden by `HEARTHTABLE_COMPENDIUM_DIR`.
2. **It degrades instead of failing.** A missing or empty directory is an empty
   compendium (`available: false`); a pack with no manifest, an unparseable
   file, or an entry that fails its schema is skipped and counted. The server
   always starts, and the sheet works with hand-entered values.
3. **It is exposed read-only over three routes**, public to every seat because
   it is reference data, not world data: `GET /api/compendium` (what is loaded),
   `GET /api/compendium/search?kind=&q=&limit=` (summaries), and
   `GET /api/compendium/:packId/:slug` (one full entry). Search is a
   case-insensitive substring match on the name, names that start with the query
   ranked first.
4. **No request parameter ever becomes a filesystem path.** Lookup is a map key.
5. **The realtime layer receives the same index** when an operation needs to copy
   an entry (`actor.addItem`).

## Consequences
- **Searches and lookups are memory reads.** No disk or SQLite on a keystroke.
- **Startup pays for the load**, synchronously, once. At a few thousand to tens
  of thousands of small files this is expected to be seconds and tens of
  megabytes, but **that is not measured**: no real import has been read through
  this loader yet (milestone 3's A.0 spike is still open). If it turns out
  slow, the fix is lazy per-pack loading, which this API does not preclude.
- **No hot reload.** Re-importing needs a server restart to be seen. Acceptable:
  re-importing is a deliberate, reviewed act (ADR 0003).
- **Search is deliberately simple.** Name substring only; no trait filter, no
  full-text, no fuzzy matching. A scan of the array per query. Good enough to
  pick a longsword; revisit if the encyclopedia (milestone 6) needs more.
- **The server holds Paizo-derived content in memory and serves it.** That is
  the same content the importer already puts on the maintainer's disk, never
  committed (ADR 0003), and it only reaches people on the table's own network.
- **A skipped file is silent in the response** apart from the `skipped` count.
  A maintainer debugging "why is this entry missing" should read the importer's
  coverage report first.

## Alternatives considered
### Read each file from disk per request
No startup cost and always current. Rejected: lookup would be a file read per
call, which is fine, but search has no index and would have to open every file
in a pack to filter by name or kind. That is thousands of reads per keystroke.

### Build a SQLite index
Indexed queries and no startup parse. Rejected for the reasons ADR 0012 gave
against SQLite packs, plus ADR 0009's rule that `worldStore.ts` is the only file
that touches `node:sqlite`, and a second schema and migration story for a
benefit (query speed over a name substring) the in-memory scan already delivers.

### Copy the whole compendium into each world's database
Self-contained worlds. Rejected for the reason ADR 0012 gave: it makes a
re-import destructive to the world and stores the same content once per world.
ADR 0014 already gives a world the *parts of the compendium it uses*, as
embedded copies on its actors, which is the right granularity.

### Let the browser download the compendium and search locally
No search route needed. Rejected: tens of thousands of entries sent to every
client, including a tablet, to answer a question the server can answer in
microseconds, and it still would not let the server make the trusted copy onto
an actor.
