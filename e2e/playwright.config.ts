/**
 * Boots the real stack the same way a contributor does by hand (see the root
 * README's Quick start): `@hearthtable/server` on its default address, and
 * `@hearthtable/client`'s Vite dev server proxying `/api` and `/socket.io` to
 * it (`apps/client/vite.config.ts`). Deliberately not the built-static path
 * (`staticDir` in `apps/server/src/app.ts`) -- that belongs to the
 * distribution milestone (ADR 0010) once packaging is chosen, and exercising
 * the dev flow here matches how every contributor actually runs this today.
 *
 * The server's "active world" is process-wide state (`activeWorld.ts`), so
 * tests cannot run concurrently against one instance -- hence `workers: 1`
 * and a single shared `webServer` pair for the whole run, not one per test.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const CLIENT_URL = 'http://127.0.0.1:5173';
const SERVER_URL = 'http://127.0.0.1:3000';
const repoRoot = join(import.meta.dirname, '..');

// Isolated from any real `worlds/` folder a contributor has locally, and
// from other runs -- the server has no "delete world" route, so a shared
// fixed path would accumulate every campaign this suite has ever created.
const worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-e2e-'));

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // The HTML report is what CI uploads as an artifact on failure (see
  // .github/workflows/ci.yml) -- 'list' alone would leave nothing to attach.
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @hearthtable/server exec tsx src/index.ts',
      cwd: repoRoot,
      url: `${SERVER_URL}/api/worlds`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { HEARTHTABLE_WORLDS_ROOT: worldsRoot },
    },
    {
      // `--host 127.0.0.1` matters: Vite's default `localhost` binding can
      // resolve to the IPv6 loopback address, which a client dialing the
      // IPv4 address explicitly (as `baseURL` above does) cannot reach.
      command:
        'pnpm --filter @hearthtable/client exec vite --host 127.0.0.1 --port 5173 --strictPort',
      cwd: repoRoot,
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
