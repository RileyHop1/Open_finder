/**
 * Milestone 7's e2e (`loot/m7-loot.spec.ts`) needs real compendium items to hand
 * out and use, which the main suite's deliberately empty compendium cannot give
 * it (`playwright.config.ts`, ADR 0013). This config points the server at a tiny,
 * hand-authored (non-Paizo) fixture instead -- `loot/fixtures/`, one rope and one
 * potion in the shape the real importer writes (ADR 0012) -- the same way
 * `playwright.rules.config.ts` does for milestone 6. It is a separate run from the
 * main suite's (same ports, its own `pnpm` script, never concurrent) so the main
 * suite keeps asserting an honestly empty compendium.
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
  testDir: './loot',
  projects: [
    {
      name: 'chromium',
      // The character sheet and the Manage party drawer both dock in the map
      // column and this spec keeps the sheet open behind the drawer, so the
      // default 1280x720 is too narrow for both at once.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1800, height: 900 } },
    },
  ],
  webServer: [
    {
      ...baseServer,
      env: {
        ...baseServer.env,
        HEARTHTABLE_COMPENDIUM_DIR: new URL('./loot/fixtures', import.meta.url).pathname,
      },
    },
    clientServer,
  ],
});
