# 0012. Compendium packs are flat JSON files, not a database

- **Status:** Accepted
- **Date:** 2026-09-29
- **Relates to:** ADR 0002 (storage for worlds; this is deliberately not that),
  ADR 0011 (the pipeline that produces this output)

## Context
The importer's converted output — one Zod-validated entry per feat, spell,
weapon, ancestry, class, creature, and so on — has to live somewhere on disk
under `systems/pf2e/.data/imported/`, git-ignored per ADR 0003. That output is
read-only from every consumer's point of view: nothing in milestone 2 writes to
it except the importer itself, and CLAUDE.md's Architecture section already
describes compendiums as "read-only document packs... that can be imported into
a world" — a pack is a source a world pulls from, not a world.

Two things this project already has make the obvious answer *look* like SQLite:
ADR 0002 chose it for worlds, and `apps/server`'s `WorldStore` already knows how
to store JSON-bodied documents with an index. Using the same mechanism here
would be consistent. It would also be wrong, for reasons specific to what a
pack is and who touches it.

## Decision
**A pack is a directory of individual JSON files, one per entry, plus one
manifest file.**

```
systems/pf2e/.data/imported/<packId>/
  pack.json                # packId, name, upstream pin + checksum, entryCount, generatedAt
  <slug>.json              # one compendiumEntrySchema-shaped document per file
```

1. Each entry file is independently readable, diffable, and greppable with
   ordinary tools — no query layer required to answer "what does this file
   contain."
2. `pack.json` is the pack-level manifest: which upstream commit and checksum
   produced it (ADR 0011), when, and how many entries. It is what F.1's CI
   assertions and a human re-import both read first.
3. The importer writes with deterministic key ordering, so re-running it against
   unchanged input produces byte-identical files — a property a database file's
   binary format does not give you for free, and one the verification steps in
   the milestone plan rely on directly.
4. Nothing opens `node:sqlite` to read a pack. `apps/server/src/worldStore.ts`
   remains the only file in the repository that imports it (ADR 0009's
   isolation boundary), and a pack loader — whenever milestone 3 needs one —
   reads plain files and calls `WorldStore.putDocument()` for each entry it
   copies into a world, the same as any other document creation path.

## Consequences
- **Inspectable without tooling.** A contributor debugging "why didn't this feat
  import" opens one file. Nothing about the format needs `apps/server` running.
- **`git diff`-able during importer development**, even though the whole
  directory is git-ignored in the committed repo — a contributor's own working
  copy still benefits from ordinary diffing between two local import runs.
- **No indexed lookup.** Finding "every feat with trait X" means reading every
  file in a pack, not running a query. Acceptable for milestone 2, which only
  ever writes and does aggregate reporting over packs; it is milestone 3's
  pack-loader design (out of this milestone's scope) that will decide whether an
  in-memory index gets built at load time, and that decision does not touch this
  on-disk format either way.
- **Many small files.** Tens of thousands of entries means tens of thousands of
  files under `.data/imported/`. This cost is paid once per machine per import
  and never reaches git, so it is a local disk and file-count cost only, not a
  distribution one.
- **Loading a pack into a world is explicitly deferred.** This ADR fixes the
  producer's output format; it does not design the consumer. That keeps this
  decision narrow and reversible on the consumer side without touching the
  producer.

## Alternatives considered
### One SQLite file per compendium pack
Reuses `node:sqlite` and gives indexed lookups from day one. Rejected: it
couples a licensing-critical, purely file-producing tool to `apps/server`'s only
database dependency for no benefit milestone 2 needs, makes the output opaque to
casual inspection (a binary file instead of files a contributor can open),
and — because nothing consumes a pack yet — pays a real cost (schema design,
migration story for a second SQLite consumer) against a benefit (query
performance) that has no caller in this milestone to justify it.

### Write directly into a `world.db`
Fewer moving parts: import once, straight into the database a session already
reads from. Rejected on architecture grounds, not convenience ones: a
compendium is supposed to be a read-only source multiple worlds import *from*
(CLAUDE.md's Architecture section), and writing straight into one specific
world's database makes re-importing destructive to that world's own data and
makes "the same pack in two worlds" require two full copies from scratch rather
than two lightweight imports from one shared source.

### A single JSON file per pack instead of one file per entry
Fewer files, and still git-ignored so file count doesn't matter for the
repository itself. Rejected: it makes `git diff`-style inspection during
importer development much harder (a single multi-megabyte file where one entry
changed), and it means loading one entry requires parsing the whole pack — a
cost this format avoids by construction, at zero cost of its own since nothing
here needs whole-pack atomicity.
