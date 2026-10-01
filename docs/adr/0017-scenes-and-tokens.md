# 0017. Scenes and tokens: separate documents, a party-owned "current scene", drag previews outside the log

- **Status:** Accepted
- **Date:** 2026-09-30
- **Relates to:** ADR 0001 (stack, PixiJS), ADR 0005 (concurrency, token
  movement), ADR 0007 (seats, trusted network), ADR 0014 (actor shape)

## Context
Milestone 4 adds the first spatial documents: a `Scene` (a map image, a grid,
links to other scenes) and the tokens on it. Several forces pull on the shape:

- **Players must not see what the GM has not shown them.** A hidden monster's
  token, and a scene the party has not reached, must not reach a player's
  browser at all. Today the server filters what a viewer *may read*
  (`visibility.ts`), but it cannot take something away: a document that stops
  being readable is just dropped from the broadcast, so a player who already
  holds it keeps the stale copy.
- **A token move is the hot path** (ADR 0005, decision 6). It fires
  continuously during a drag, must be visible to others in under 100ms on a LAN,
  and should cost one small write when it settles, not a rewrite of the scene.
- **The party moves as one** through a layered world (CLAUDE.md, Game flow). The
  GM decides where the party is, and "where is the party" has to have one owner.
- **The canvas is the largest unknown in the stack.** CLAUDE.md asks for a
  throwaway spike early; it had not been done, so the PixiJS major version and
  the 60fps budget were both unproven.

### What the canvas spike measured (2026-09-30)
Throwaway branch, since deleted. PixiJS 8.21.0 inside the Vite/Vue client, one
8000x8000 generated texture, a grid drawn as 160 stroked lines, 100 draggable
circles with grid snapping, wheel zoom and drag pan, in headless Chromium on the
maintainer's machine:

- It loads and renders with no build or typing trouble; the `webgl` renderer was
  selected.
- `MAX_TEXTURE_SIZE` was **8192** on that machine. An 8000px map fits, but 8192
  is a common ceiling and some integrated GPUs and Safari report less, so an
  uploaded map can exceed what a device can hold as one texture.
- Frame time averaged **18.9 ms (about 53 fps), 95th percentile 33 ms.** That is
  below the 60fps budget in CLAUDE.md, and it was **not** measured on integrated
  graphics, so it neither proves nor disproves the budget. The grid redrawn as
  vector lines every frame is the obvious suspect.

## Decision
1. **A token is its own document** (`type: 'token'`) with `sceneId`, `actorId`,
   a position in scene pixels, `size`, and `hidden`. It is not an array inside
   the scene. A settled move then writes and broadcasts one small document.
2. **The server derives a token's permissions, and the existing read filter
   applies unchanged.** A token is readable by players only when its scene is
   the party's current scene and it is not hidden; the GM always reads
   everything. Changing either fact (hiding a token, moving the party)
   recomputes the permissions of everything affected in the same transaction.
3. **A document that stops being readable is sent as a deletion.** `broadcastFor`
   currently drops it; it will instead send the bare envelope in `deleted`, so a
   client removes its stale copy. This leaks one id to someone who already held
   the document, which is acceptable under ADR 0007 (spoiler protection, not
   access control).
4. **The party owns "where we are".** `party.sceneId` names the scene the party
   is in. `scene.activate` sets it, reveals the new scene and its tokens, hides
   the old ones, and places a token for any party member without one there.
   Scenes default to `none` for players, so a scene the GM is still building is
   invisible. The GM may preview any scene locally without moving the party.
5. **Drag previews are not operations.** While a token is dragged the client
   sends throttled `token.drag` events on their own socket channel, which the
   server rate-limits and relays only to sockets that can read the token. They
   are never stored, never sequenced, and never replayed. Only the settled
   `token.move` is a durable operation (ADR 0005, decision 6).
6. **Distance goes through a `GridStrategy`** (`docs/grid.md`). The interface
   and a gridless implementation live in `packages/core`; the PF2e square grid
   (alternating 5/10-foot diagonals, creature footprints) lives in
   `systems/pf2e`, since it is a game rule.
7. **PixiJS v8, pinned to an exact version** (8.21.0 at the time of the spike),
   per ADR 0001. v8 is the current major; starting on v7 would mean doing the
   v7 to v8 port later, on a canvas with a year of code in it.
8. **The map is one background image, and the client adapts it to the device.**
   The server stores the original (assets are unbounded, ADR 0002). The client
   reads `MAX_TEXTURE_SIZE` and, if the image is larger, downscales it to fit
   when it loads it. Tiling is deferred until a real map shows the downscale is
   not good enough.
9. **The grid is drawn once and cached**, not redrawn as vector lines each
   frame, and is re-rendered only when the grid settings change. This is the
   spike's main performance lesson; milestone 4's last PRs re-measure the 100
   token, 8000x8000 budget on an integrated GPU before the milestone closes.
10. **Token size comes from the actor, set by the server at creation.** A
    creature's `size`, a character's ancestry size from the compendium, or
    medium if neither is known. The GM can change it.

## Consequences
- **Many small documents.** A busy scene is a scene plus up to a few dozen
  tokens. Each is its own row and its own broadcast, which is what keeps a move
  cheap, but the client store has to index them by scene.
- **Hiding and revealing is the server's job in every code path** that changes a
  token's scene, its `hidden` flag, or the party's scene. A path that forgets to
  recompute permissions leaks a monster. These paths are few and each gets a
  test that a player never receives the token.
- **The deletion-on-unreadable rule changes a milestone 3 behavior** (a
  document that goes from readable to unreadable now arrives as a deletion).
  Today nothing makes a document unreadable after the fact except an actor
  permission edit, which does not exist yet, so nothing visible changes.
- **Preview traffic is unreliable on purpose.** A dropped `token.drag` costs one
  frame of someone else's drag, and the settled move corrects it. There is no
  ordering or delivery guarantee to reason about, and nothing to migrate.
- **A downscaled map is softer on a limited device.** Zooming to read small
  print on a 16k map on such a device will look blurry. Accepted until it is
  shown to matter.
- **The 60fps budget is still unproven.** The spike's number is below it and was
  not taken on target hardware. This ADR commits to re-measuring, not to having
  met it.
- **One party per world** (milestone 3) means one "current scene" per world.
  Splitting the party across scenes is not supported, which matches the layered
  world in CLAUDE.md.

## Alternatives considered
### Tokens embedded in the scene document
One document, one fetch, no ids to index. Rejected: every move rewrites and
rebroadcasts the whole scene, a hidden token would need per-viewer redaction
inside a document (a step `visibility.ts` does not have, and which `limited`
already shows is hard), and two people moving different tokens would conflict on
the same document instead of on different ones.

### Each player browses scenes freely
The GM reveals scenes and players open whichever they like. Rejected for the
layered, together feel the project is after: players end up on different maps,
the GM must narrate which, and "the party" stops being one marker. The GM can
still preview a scene privately, which covers the prep case.

### Drag movement through the operation log
Every pointer move as a logged, sequenced operation. Rejected: it would write
and replay dozens of operations per second per drag, bloat the log that undo and
reconnection depend on (ADR 0005), and persist positions nobody wants back. The
settled position is the only fact worth keeping.

### Per-player current scene on the seat
Each seat stores its own scene. Rejected for the same reason as free browsing,
and because "where is the party" is exactly what the `Party` document exists to
own.

### PixiJS v7
Smaller, long-stable, and a lot of existing examples. Rejected: it is the
previous major, and moving later is the expensive port ADR 0001 warns about.

### Tile the map from the start
Avoids any downscale. Rejected for milestone 4: it needs a server-side image
pipeline (a native image dependency, which also complicates the distribution
choice in ADR 0010) for a problem the spike showed only at the edge of common
limits. Revisit if downscaling proves visibly poor.
