/**
 * The canvas budget (CLAUDE.md, Targets and budgets): **100 tokens on an
 * 8000 x 8000 map, panning and zooming at 60fps** on integrated graphics. A
 * stress scene is built through the real app (a generated 8000 x 8000 map
 * picture, a battle scene, 100 tokens), then panned and zoomed with a real mouse
 * while the page records how long each animation frame took.
 *
 * M5 D.1 adds the combat overlays to the same stress scene before the
 * scripted work runs: an active combat (so the turn bar renders all 100
 * combatants and the active one's token draws its turn marker through every
 * pan and zoom) and a placed template. Reusing the same 100-token scene,
 * rather than a second one, is the point -- the overlays are measured under
 * the worst case the budget already covers, not in isolation.
 *
 * On demand, not CI (`playwright.perf.config.ts` says why): run `pnpm test:perf`
 * on the machine that matters. It always prints the numbers and the graphics
 * card the browser really used (a software renderer such as SwiftShader says
 * nothing about a laptop, and is called out). Set `PERF_BUDGET=1` to make the
 * run fail when the budget is missed: p95 frame time over 20ms, or an average
 * under 55fps.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  addSeat,
  claimSeat,
  createAndActivateCampaign,
  waitForConnected,
} from '../tests/helpers.js';
import { generateMapPng } from './pngMap.js';

const MAP_SIZE = 8000;
const TOKENS = 100;
const FRAME_BUDGET_MS = 1000 / 60;

interface Stats {
  phase: string;
  frames: number;
  fps: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  worstMs: number;
  /** Share of frames that took longer than two frames' time: a visible hitch. */
  hitchPercent: number;
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0;
}

function summarise(phase: string, intervals: readonly number[]): Stats {
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((sum, ms) => sum + ms, 0);
  return {
    phase,
    frames: intervals.length,
    fps: total === 0 ? 0 : (intervals.length / total) * 1000,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    worstMs: sorted[sorted.length - 1] ?? 0,
    hitchPercent:
      (intervals.filter((ms) => ms > FRAME_BUDGET_MS * 2).length /
        Math.max(intervals.length, 1)) *
      100,
  };
}

/** The app's own stores, reached through the mounted Vue app (the same the page uses). */
async function sendOperation(
  page: Page,
  store: 'scenes' | 'documents',
  type: string,
  payload: unknown,
) {
  const ok = await page.evaluate(
    async ([name, opType, opPayload]) => {
      const app = (
        document.querySelector('#app') as unknown as {
          __vue_app__: {
            config: {
              globalProperties: {
                $pinia: {
                  _s: Map<string, { send: (t: string, p: unknown) => Promise<boolean> }>;
                };
              };
            };
          };
        }
      ).__vue_app__;
      const target = app.config.globalProperties.$pinia._s.get(name);
      return target?.send(opType, opPayload) ?? false;
    },
    [store, type, payload] as const,
  );
  expect(ok, `${type} was refused`).toBe(true);
}

/** Calls a zero-argument method on one of the app's own stores, such as `combat.startCombat`. */
async function callStoreMethod(
  page: Page,
  store: 'combat',
  method: string,
): Promise<void> {
  const ok = await page.evaluate(
    async ([name, methodName]) => {
      const app = (
        document.querySelector('#app') as unknown as {
          __vue_app__: {
            config: {
              globalProperties: {
                $pinia: { _s: Map<string, Record<string, () => Promise<boolean>>> };
              };
            };
          };
        }
      ).__vue_app__;
      const target = app.config.globalProperties.$pinia._s.get(name);
      return (await target?.[methodName]?.()) ?? false;
    },
    [store, method] as const,
  );
  expect(ok, `${store}.${method} was refused`).toBe(true);
}

/** Records the time between animation frames until `stop` is awaited. */
async function recordFrames(page: Page, run: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last);
      last = now;
      if (!w.__stop) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await run();
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__stop = true;
    // The first interval includes the page's own setup.
    return w.__frames.slice(1);
  });
}

test('canvas budget: 100 tokens on an 8000 x 8000 map', async ({ browser }, testInfo) => {
  const campaign = `Perf ${crypto.randomUUID()}`;
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const gm = await context.newPage();

  // --- the stress scene, built through the real app ---
  await createAndActivateCampaign(gm, campaign);
  await waitForConnected(gm);
  await addSeat(gm, 'Game Master', true);
  await claimSeat(gm, 'Game Master');

  const worlds = (await (await gm.request.get('/api/worlds')).json()) as {
    id: string;
    name: string;
  }[];
  const worldId = worlds.find((world) => world.name === campaign)?.id;
  expect(worldId).toBeDefined();
  const deviceToken = await gm.evaluate(() =>
    localStorage.getItem('hearthtable:deviceToken'),
  );
  const upload = await gm.request.post(`/api/worlds/${worldId}/assets`, {
    headers: { 'content-type': 'image/png', 'x-device-token': deviceToken ?? '' },
    data: generateMapPng(MAP_SIZE),
  });
  expect(upload.ok()).toBe(true);
  const { name: picture } = (await upload.json()) as { name: string };

  await sendOperation(gm, 'scenes', 'scene.create', { name: 'Stress', kind: 'battle' });
  await gm.waitForFunction(() => document.body.innerText.length > 0);
  const sceneId = await gm.evaluate(async () => {
    const app = (
      document.querySelector('#app') as unknown as {
        __vue_app__: {
          config: {
            globalProperties: {
              $pinia: { _s: Map<string, { scenes: { id: string; name: string }[] }> };
            };
          };
        };
      }
    ).__vue_app__;
    const store = app.config.globalProperties.$pinia._s.get('scenes');
    for (let i = 0; i < 100; i += 1) {
      const found = store?.scenes.find((scene) => scene.name === 'Stress');
      if (found !== undefined) {
        return found.id;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  });
  expect(sceneId).toBeDefined();
  await sendOperation(gm, 'scenes', 'scene.update', {
    sceneId,
    changes: { background: picture, width: MAP_SIZE, height: MAP_SIZE },
  });
  await sendOperation(gm, 'scenes', 'scene.activate', { sceneId });

  await sendOperation(gm, 'documents', 'actor.create', {
    kind: 'character',
    name: 'Pawn',
  });
  const actorId = await gm.evaluate(async () => {
    const app = (
      document.querySelector('#app') as unknown as {
        __vue_app__: {
          config: {
            globalProperties: {
              $pinia: { _s: Map<string, { actors: { id: string; name: string }[] }> };
            };
          };
        };
      }
    ).__vue_app__;
    const store = app.config.globalProperties.$pinia._s.get('documents');
    for (let i = 0; i < 100; i += 1) {
      const found = store?.actors.find((actor) => actor.name === 'Pawn');
      if (found !== undefined) {
        return found.id;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  });
  expect(actorId).toBeDefined();
  // A 10 x 10 spread over the whole map, so tokens are on screen at every zoom.
  for (let index = 0; index < TOKENS; index += 1) {
    await sendOperation(gm, 'scenes', 'token.create', {
      sceneId,
      actorId,
      at: {
        x: 400 + (index % 10) * 750,
        y: 400 + Math.floor(index / 10) * 750,
      },
    });
  }
  await expect(gm.locator('.token-list li')).toHaveCount(TOKENS, { timeout: 30_000 });
  await expect(gm.locator('.map-surface canvas')).toBeVisible();
  // The map picture is 64 MB of pixels to decode and upload: let it land.
  await gm.waitForTimeout(4000);

  // --- the combat overlays (M5 D.1): turn bar, turn marker, a template ---
  await callStoreMethod(gm, 'combat', 'startCombat');
  await expect(gm.locator('[data-testid="turn-bar"] ol li')).toHaveCount(TOKENS, {
    timeout: 30_000,
  });
  await sendOperation(gm, 'scenes', 'template.place', {
    sceneId,
    shape: 'burst',
    at: { x: MAP_SIZE / 2, y: MAP_SIZE / 2 },
    feet: 20,
  });
  await expect(gm.locator('.template-list li')).toHaveCount(1);

  const gpu = await gm.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl === null) {
      return { renderer: 'no WebGL2', maxTexture: 0 };
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: String(
        gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL),
      ),
      maxTexture: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    };
  });

  // --- the scripted work ---
  const surface = gm.locator('.map-surface');
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await gm.mouse.move(centre.x, centre.y);

  mkdirSync(testInfo.outputDir, { recursive: true });
  await surface.screenshot({ path: testInfo.outputPath('fit-zoom.png') });

  const results: Stats[] = [];
  const phases: [string, () => Promise<void>][] = [
    ['idle at fit', () => gm.waitForTimeout(2000)],
    [
      'zoom in and out',
      async () => {
        for (let round = 0; round < 6; round += 1) {
          for (let notch = 0; notch < 8; notch += 1) {
            await gm.mouse.wheel(0, -120);
            await gm.waitForTimeout(40);
          }
          for (let notch = 0; notch < 8; notch += 1) {
            await gm.mouse.wheel(0, 120);
            await gm.waitForTimeout(40);
          }
        }
      },
    ],
    [
      'pan at zoom',
      async () => {
        for (let notch = 0; notch < 6; notch += 1) {
          await gm.mouse.wheel(0, -120);
        }
        for (let lap = 0; lap < 6; lap += 1) {
          await gm.mouse.move(centre.x - 200, centre.y);
          await gm.mouse.down();
          await gm.mouse.move(centre.x + 200, centre.y + 150, { steps: 40 });
          await gm.mouse.move(centre.x - 200, centre.y - 150, { steps: 40 });
          await gm.mouse.up();
        }
      },
    ],
  ];
  for (const [phase, run] of phases) {
    results.push(summarise(phase, await recordFrames(gm, run)));
  }

  // --- the report ---
  const software = /swiftshader|llvmpipe|software/i.test(gpu.renderer);
  const lines = [
    `Graphics: ${gpu.renderer} (max texture ${gpu.maxTexture})${
      software
        ? '  ** SOFTWARE RENDERING: these numbers say nothing about a laptop **'
        : ''
    }`,
    `Scene: ${MAP_SIZE} x ${MAP_SIZE}, ${TOKENS} tokens`,
    ...results.map(
      (r) =>
        `${r.phase.padEnd(16)} ${r.fps.toFixed(1).padStart(5)} fps   median ${r.medianMs.toFixed(1)} ms   p95 ${r.p95Ms.toFixed(1)} ms   p99 ${r.p99Ms.toFixed(1)} ms   worst ${r.worstMs.toFixed(1)} ms   hitches ${r.hitchPercent.toFixed(1)}%   (${r.frames} frames)`,
    ),
  ];
  console.log(`\n${lines.join('\n')}\n`);
  writeFileSync(
    testInfo.outputPath('canvas-budget.json'),
    JSON.stringify(
      { gpu, software, mapSize: MAP_SIZE, tokens: TOKENS, results },
      null,
      2,
    ),
  );

  if (process.env.PERF_BUDGET === '1') {
    for (const r of results) {
      expect(r.p95Ms, `${r.phase}: p95 frame time`).toBeLessThanOrEqual(20);
      expect(r.fps, `${r.phase}: average fps`).toBeGreaterThanOrEqual(55);
    }
  }
  await context.close();
});
