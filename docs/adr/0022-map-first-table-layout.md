# 0022. Map-first table layout

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The play screen (`TableView.vue`) grew one panel per milestone — the party bar
in M3, the map in M4, the turn bar and action dock in M5 — each added as its
own block in a page that scrolls, with `App.vue`'s header and `main`'s padding
still wrapping all of it. The result is a lot of fixed chrome and dead space
around the one thing a table actually looks at for most of a session: the map.
A player reported it plainly — the end-turn controls, the turn order, and
chat all sit outside the map, and a bug in one floating note (a refused move's
toast growing to cover the whole map, `fix/move-error-toast`) went unnoticed
for a while specifically because nothing about the layout drew attention back
to the map as the main event.

The north star asks "if Owlcat made a Pathfinder 2E game, how would it feel?"
Owlcat's games, and Foundry's own canvas-first design, answer this the same
way: the map (or scene) *is* the screen, and every other panel is an overlay
on top of it, not a sibling block pushing it around. That's the shape this
ADR commits the client to.

## Decision
1. **Once a seat is claimed, `TableView` is the entire page.** It sets
   `position: fixed; inset: 0` and `App.vue`/`CampaignLobby.vue` hide their
   own header, padding, and lobby chrome for exactly as long as a seat is
   held — there is no router here (ADR-less, by convention: this app picks
   screens by store state), so this is a plain `v-if` on `lobby.mySeat`
   rather than a route change.
2. **The map pane fills whatever space is left**, after its few
   content-sized siblings (the toolbar, the turn bar, the action dock) —
   `flex: 1 1 auto` inside a flex column that itself stretches to the grid
   row's full height, not a fixed or user-resized pixel height. This
   replaces the resizable map-height feature (`useMapPaneResize.ts`,
   `mapPaneHeight.ts`) added in M5: that machinery existed because a fixed
   height risked starving the turn bar or action dock off-screen in a page
   that still had other panels competing for room above and below the map.
   Once those panels become overlays *on* the map (the PRs after this one)
   rather than siblings beside it, there is no longer a competing claim on
   vertical space for a person to resize around.
3. **Everything else becomes an overlay, in separate PRs, not this one.**
   This ADR and its PR only establish the full-bleed shell and remove the
   resize machinery; the party bar/turn bar merge, the chat overlay, the
   gear menu, and the action dock's repositioning are each their own PR
   (tracked alongside this one), so each stays small and independently
   reviewable per CLAUDE.md's "Pull requests" rule.
4. **`MapCanvas.vue` gets a `ResizeObserver`** on its own host element, in
   addition to PixiJS's `resizeTo` (which only re-measures on the window's
   own `resize` event). A map-first layout now changes the map pane's pixel
   size whenever a sibling overlay's content changes height, which isn't a
   window resize at all; without the observer the canvas would silently
   stay the wrong size until the next time the browser window itself
   resized.

## Consequences
- **Less chrome, more map**, immediately — this PR alone removes the app
  header, the lobby's own heading and status lines, and the map's fixed/
  resizable height, for the duration a seat is held.
- **A short transitional state across this PR and the next one or two.**
  "Back to campaigns" and the seat roster ("Add seat", claiming a seat for
  someone else) have nowhere to live yet once the lobby's own chrome is
  hidden — `feat/gear-menu` (next) gives them a real home. In the meantime,
  "Back to campaigns" is floated above the map directly (`position: fixed`,
  high `z-index`) rather than left unreachable, and the seat roster is
  reachable by releasing the current seat, the same screen it always lived
  on. This is a known, accepted gap for one PR cycle, not a silent loss.
- **`useMapPaneResize`/`mapPaneHeight` are deleted outright**, not kept
  around unused: nothing in the map-first shell calls them, and CLAUDE.md's
  "no speculative code" rule applies to removing dead code the same way it
  applies to not adding it ahead of a real caller.
- **Every later overlay PR inherits a correctly-sized map to overlay onto**,
  rather than each one having to also solve "and now make the map actually
  fill the screen" piecemeal.

## Alternatives considered
### Keep the stacked-panel layout and just trim padding/margins
Cheaper, and wouldn't touch the resize machinery or any component's
structure. Rejected: it doesn't address what was actually reported — the map
competing for space with siblings rather than being the screen — and every
future overlay (chat, the gear menu, the merged party/turn bar) would still
need to be built against a page that scrolls and resizes unpredictably
instead of a fixed, known viewport.

### A router-driven full-screen "play" route
More conventional (a dedicated `/play/:worldId` route that owns its own
layout), and would make the map-first shell explicit in the URL. Rejected for
now: this app has no router at all (CLAUDE.md's "Thin thread first" — nothing
earlier needed deep links or back/forward), and adding one is a much larger,
unrelated change to make for a screen that's already selected correctly by
`lobby.mySeat`. Worth revisiting if a real need for deep-linkable screens
shows up later.

### Resize the map pane to the viewport in JavaScript instead of flex/grid
Explicit pixel math (read `window.innerHeight`, subtract known sibling
heights) is more predictable at a glance than a flex chain, but it's also
exactly the kind of brittle, siblings-aware calculation `useMapPaneResize`
already was, and it breaks the moment a sibling's height changes for a
reason the calculation didn't know about (an error toast, a longer turn-bar
row). A flex layout that simply gives the map pane whatever is left over
handles that for free.
