# @hearthtable/e2e

Playwright coverage of milestone 1's primary flow: a GM activates a campaign, a
player joins its lobby and claims a seat, the GM sees that live without a
refresh, and a `/roll` is a real dice roll both of them see the same total for
(`tests/lobby-and-chat.spec.ts`). Two independent `BrowserContext`s stand in
for two separate machines, matching how `docs/adr/0007-seats-not-accounts.md`
identifies a returning browser.

Milestone 3's flow is `tests/character-and-party.spec.ts`: a player makes and
hand-builds a character (Strength, a trained skill, checked against a total
worked out by hand), the GM adds it to the party and both party bars show it,
a condition lowers a skill on both screens, and the player's roll lands as the
same card in both chats. A hidden actor never reaching a player is **not** here:
there is no UI to hide one yet, so the server's socket tests hold that.

Milestone 4's flow is `tests/scenes-and-tokens.spec.ts`: a GM builds two scenes and
an exit between them, moves the party in, and places two characters; the player moves
their own token by the keyboard (the token list's route, since the map is a canvas),
and the GM's screen shows the new distance. A character the GM owns will not move for
the player, only the GM sees exits, and taking one moves the party on both screens. A
compendium monster is **not** used: the config's compendium is empty on purpose, and
ownership is the same rule for a GM-owned character; the server's `tokens.test.ts`
holds the creature half.

`tests/helpers.ts` holds the shared steps. The server's active world is
process-wide and nothing deactivates it, so only the first spec of a run finds
the campaign list; `createAndActivateCampaign` drives the UI when it can and
creates and activates the campaign over HTTP when a previous spec left one
active. The config also points the server at an empty compendium, so no spec
depends on what a contributor has imported.

## Running it

```bash
pnpm --filter @hearthtable/e2e exec playwright install chromium   # once
pnpm test:e2e
```

`playwright.config.ts` starts the real stack itself -- `@hearthtable/server`
on its default address and `@hearthtable/client`'s Vite dev server proxying to
it, the same two commands the root README's Quick start has a contributor run
by hand -- against a throwaway temp `worlds/` folder, so nothing here ever
touches a real campaign. There is nothing to start yourself first.

It **never reuses a server that is already running**: a dev server of your own
on those ports serves your real `worlds/` folder, and the specs create and activate
campaigns, which would litter it and switch your active campaign. If one is
running the run stops with "port already used"; stop it first (and start it again
afterwards).

## The canvas budget (on demand)

`pnpm test:perf` builds a stress scene through the real app -- a generated
8000 x 8000 map picture, a battle scene, 100 tokens -- then zooms and pans it with a
real mouse while the page records the time between animation frames, and prints
fps, median, p95, p99, worst frame, and the share of visible hitches for each of
three phases, **with the graphics card the browser really used**. It is not part
of CI (frame timing on a shared runner is noise, and a headless browser with no
card renders in software, which it calls out). Run it on the machine whose numbers
matter, with the dev server stopped:

```bash
pnpm test:perf                      # the browser picks its graphics backend
PERF_ANGLE=d3d11 pnpm test:perf     # Windows; metal on a Mac, gl or vulkan on Linux
PERF_HEADED=1 pnpm test:perf        # show the window (some drivers need it for the real GPU)
PERF_BUDGET=1 pnpm test:perf        # fail if p95 > 20ms or the average is under 55fps
```

A display that refreshes at 60Hz cannot show more than 60fps, so a run at 60.0 with
no hitches means the frame budget is met, not by how much.

## How it fits

Depends on nothing else in the workspace; it only ever talks to
`@hearthtable/server` and `@hearthtable/client` over HTTP and WebSocket, the
same way a real browser does. Not run by `pnpm test` (that stays Vitest-only,
seconds not minutes) -- run by `pnpm test:e2e` and by CI's own `e2e` job.
