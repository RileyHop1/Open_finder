# 0014. Actors: a system-agnostic envelope, a PF2e payload, embedded item copies

- **Status:** Accepted
- **Date:** 2026-09-30
- **Relates to:** ADR 0002 (worlds are self-contained), ADR 0004 (rule elements),
  ADR 0008 (modifier resolution), ADR 0012 (packs are read-only sources)

## Context
Milestone 3 introduces the first two real content documents: `Actor` and
`Party`. Three forces shape the `Actor`:

- **The core engine is system-agnostic** (CLAUDE.md, Architecture). `packages/core`
  must not know what a proficiency rank is, yet it owns the document envelope,
  permissions, and operations.
- **A character must survive a re-import.** The pinned upstream can move
  (ADR 0011), and a reviewed re-import may change a feat's rule elements. If a
  character only *pointed at* compendium entries, a re-import would silently
  change a campaign's numbers with no diff in the world. A world is the unit of
  backup and moving to another machine (ADR 0002), so it should not depend on a
  git-ignored folder that exists only on the machine that imported it.
- **Milestone 8's wizard and milestone 3's hand-building must write the same
  data.** Whatever the sheet stores by hand today is what the wizard stores
  later, so the shape cannot be a sheet-only convenience.

## Decision
1. **`actor` is a `baseDocumentSchema` extension** in `packages/core`
   with `name`, an optional `portrait` (a content-addressed asset hash), and a
   `system` payload typed `unknown` at the core level. Core validates the
   envelope; it never inspects `system`.
2. **`systems/pf2e` owns the payload's schema** (`characterDataSchema`):
   level, attribute modifiers, explicit proficiency ranks, HP, conditions, and
   items. The server validates an actor's `system` against it after every
   mutation. The server depends on `@hearthtable/pf2e` directly, with no
   system registry: `systems/pf2e` is the only system we ship (CLAUDE.md, Out
   of scope).
3. **Items are embedded copies**, stored inside the actor's `system.items`.
   Each carries the compendium entry as it was when added, plus a `sourceId`
   (pack and slug) recording where it came from. Adding an item is a server
   operation that copies the entry itself; a client never supplies entry
   content.
4. **Proficiency ranks are stored explicitly.** "Fill from class" computes
   defaults with `rankAtLevel` and writes them as ordinary values.
5. **Conditions are stored as `{ slug, value? }`** on the actor. Their
   modifiers are computed, never stored (docs/conditions.md), so they always
   flow through ADR 0008's stacking rules.
6. **`Party` is its own document**, holding an ordered `memberIds` list, not a
   flag on each actor.

## Consequences
- A world is self-contained: opening it on a machine with no imported packs
  still renders every character correctly.
- A re-import never changes an existing character. The cost is that a character
  does not pick up upstream fixes on its own; a later "refresh from compendium"
  action would be a deliberate, per-item operation, and is not built now.
- Storage grows: each actor carries full copies of its items' text and rule
  elements. At a table of five friends this is small.
- The core stays testable without PF2e, but the server now imports the pf2e
  package. Other systems would need a registry; that is a real refactor
  we are choosing to defer, since no second system is planned.
- Explicit ranks mean the sheet can disagree with the class table if someone
  edits one. That is intentional (the GM can always override) and
  the disagreement is visible, since the ranks are shown.
- Changing `characterDataSchema` is a document migration (`schemaVersion`), so
  it must ship with a fixture test, per CLAUDE.md's Data durability section.

## Alternatives considered
### Items as separate `Item` documents owned by an actor
Closest to Foundry, and gives per-item permissions and independent queries.
Rejected for milestone 3: the sheet always loads an actor's items together,
nothing needs to query items across actors, and it turns one atomic actor update
into several documents that must stay consistent inside one transaction. It can
be revisited when the encounter builder needs cross-actor item queries.

### Reference compendium entries live, by pack and slug
Smallest storage and always current. Rejected: a re-import silently changes
existing characters, and a world would stop being portable, since the pack
folder is git-ignored and machine-local. A wrong number the player trusts is
worse than a stale one.

### Derive ranks from class and level, storing only overrides
Less to type, and one source of truth for the class table. Rejected: it needs an
override layer, and hand-building a character (this milestone's goal) works
against derived data. Explicit ranks are also exactly what the wizard will write.
