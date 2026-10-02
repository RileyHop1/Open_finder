/**
 * The canvas budget check (CLAUDE.md, Targets and budgets: 100 tokens on an
 * 8000 x 8000 map, panning and zooming at 60fps on integrated graphics). It is
 * **on demand, not part of CI**: frame timing on a shared CI runner is noise, and
 * a headless browser with no graphics card renders in software, which says
 * nothing about a laptop. Run it with `pnpm test:perf` on the machine whose
 * numbers matter. It starts the same two servers as the ordinary e2e run.
 *
 * `PERF_ANGLE` picks the graphics backend the browser asks for (`d3d11` on
 * Windows, `metal` on a Mac, `gl` or `vulkan` on Linux; the default lets the
 * browser choose). `PERF_HEADED=1` shows the window, which some drivers need
 * before they hand over the real GPU.
 */
import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config.js';

const angle = process.env.PERF_ANGLE;

export default defineConfig({
  ...base,
  testDir: './perf',
  // A long scenario: it builds a world, then pans and zooms for several seconds.
  timeout: 240_000,
  reporter: [['list']],
  projects: [
    {
      name: 'chromium-gpu',
      use: {
        ...devices['Desktop Chrome'],
        headless: process.env.PERF_HEADED !== '1',
        launchOptions: {
          args: [
            '--ignore-gpu-blocklist',
            '--enable-gpu-rasterization',
            ...(angle === undefined ? [] : [`--use-angle=${angle}`]),
          ],
        },
      },
    },
  ],
});
