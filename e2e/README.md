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

## How it fits

Depends on nothing else in the workspace; it only ever talks to
`@hearthtable/server` and `@hearthtable/client` over HTTP and WebSocket, the
same way a real browser does. Not run by `pnpm test` (that stays Vitest-only,
seconds not minutes) -- run by `pnpm test:e2e` and by CI's own `e2e` job.
