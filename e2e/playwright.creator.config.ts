/**
 * Milestone 8's e2e (`creator/m8a-creator.spec.ts`) builds a character through the
 * guided creator, which needs a real (if tiny) compendium: an ancestry, a
 * background, a class with a choice, two feats and some gear. The main suite's
 * deliberately empty compendium cannot give it that (`playwright.config.ts`,
 * ADR 0013), so this config points the server at a hand-authored, invented
 * fixture (`creator/fixtures/`, in the shape the real importer writes, ADR 0012)
 * -- never Paizo content -- the same way `playwright.loot.config.ts` does for
 * milestone 7. A separate run from the main suite's (same ports, its own `pnpm`
 * script, never concurrent).
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
  testDir: './creator',
  projects: [
    {
      name: 'chromium',
      // The creator is a full-screen wizard with a live sheet beside it, and the
      // table's own sheet panel is wide, so the default 1280x720 is too tight.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
    },
  ],
  webServer: [
    {
      ...baseServer,
      env: {
        ...baseServer.env,
        HEARTHTABLE_COMPENDIUM_DIR: new URL('./creator/fixtures', import.meta.url)
          .pathname,
      },
    },
    clientServer,
  ],
});
