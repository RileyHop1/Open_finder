# @hearthtable/e2e

Playwright coverage of milestone 1's primary flow: a GM activates a campaign, a
player joins its lobby and claims a seat, the GM sees that live without a
refresh, and a `/roll` is a real dice roll both of them see the same total for
(`tests/lobby-and-chat.spec.ts`). Two independent `BrowserContext`s stand in
for two separate machines, matching how `docs/adr/0007-seats-not-accounts.md`
identifies a returning browser.

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
