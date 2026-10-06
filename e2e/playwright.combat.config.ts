/**
 * M5 D.2's combat-turn e2e needs a character that can actually strike
 * something, and the main suite's server runs with an empty compendium on
 * purpose (`playwright.config.ts`: "the suite must not depend on whatever a
 * contributor happens to have imported locally", ADR 0013). `actor.addItem`
 * only ever copies from the server's own compendium (ADR 0014: a client can
 * never supply item stats), so there is no way to put a real weapon on a
 * character against a truly empty one.
 *
 * This config points at a tiny, hand-authored (non-Paizo) weapon fixture
 * instead -- `combat/fixtures/`, one longsword, in the same shape the real
 * importer writes (ADR 0012) -- so `combat-turn.spec.ts` stays hermetic and
 * fast while still exercising the real "Add an item from the compendium"
 * and "Equipped" UI, not a shortcut around it. It is a separate `webServer`
 * from the main suite's (same ports, run by a separate `pnpm` script, never
 * concurrently) specifically so the two existing specs keep asserting an
 * honestly empty compendium.
 */
import { defineConfig } from '@playwright/test';

import base from './playwright.config.js';

const baseServer = Array.isArray(base.webServer) ? base.webServer[0] : undefined;
const clientServer = Array.isArray(base.webServer) ? base.webServer[1] : undefined;
if (baseServer === undefined || clientServer === undefined) {
  throw new Error('playwright.config.js must define its two webServers as an array');
}

export default defineConfig({
  ...base,
  testDir: './combat',
  // A long scenario: two full characters, a scene, and a full combat turn.
  timeout: 90_000,
  use: { ...base.use, actionTimeout: 10_000 },
  // No viewport override: the action dock and the top strip (ADR 0022,
  // feat/bottom-action-dock) both overlay the map now instead of stacking
  // it taller than the default viewport, so `base`'s own project (the
  // default 1280x720) is enough.
  webServer: [
    {
      ...baseServer,
      env: {
        ...baseServer.env,
        HEARTHTABLE_COMPENDIUM_DIR: new URL('./combat/fixtures', import.meta.url)
          .pathname,
      },
    },
    clientServer,
  ],
});
