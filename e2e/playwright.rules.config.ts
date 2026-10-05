/**
 * Milestone 6's e2e (`rules/m6-e2e.spec.ts`) needs a real condition entry with
 * a nested trait reference to prove the Rules drawer's search and nested
 * tooltips actually work end to end -- the main suite's server runs with an
 * empty compendium on purpose (`playwright.config.ts`: "the suite must not
 * depend on whatever a contributor happens to have imported locally", ADR
 * 0013). This config points at a tiny, hand-authored (non-Paizo) fixture
 * instead -- `rules/fixtures/`, one condition and one trait, in the same
 * shape the real importer writes (ADR 0012) -- so the spec stays hermetic and
 * fast while still exercising the real search and tooltip UI, not a shortcut
 * around it. It is a separate `webServer` from the main suite's and from
 * `playwright.combat.config.ts`'s (same ports, run by a separate `pnpm`
 * script, never concurrently) for the same reason that one is separate: so
 * the main suite keeps asserting an honestly empty compendium.
 */
import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config.js';

const baseServer = Array.isArray(base.webServer) ? base.webServer[0] : undefined;
const clientServer = Array.isArray(base.webServer) ? base.webServer[1] : undefined;
if (baseServer === undefined || clientServer === undefined) {
  throw new Error('playwright.config.js must define its two webServers as an array');
}

export default defineConfig({
  ...base,
  testDir: './rules',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The character sheet and the Rules drawer both dock in the map
        // column (`TableView.vue`'s `.sheet-pane`/`.rules-pane`) and this
        // spec keeps the sheet open behind the drawer, same as
        // `playwright.combat.config.ts`'s own viewport override for its own
        // overlap: the default 1280x720 is too narrow for both at once.
        viewport: { width: 1800, height: 900 },
      },
    },
  ],
  webServer: [
    {
      ...baseServer,
      env: {
        ...baseServer.env,
        HEARTHTABLE_COMPENDIUM_DIR: new URL('./rules/fixtures', import.meta.url).pathname,
      },
    },
    clientServer,
  ],
});
