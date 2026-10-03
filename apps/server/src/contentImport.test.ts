import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createReloadableCompendium } from './compendium.js';
import {
  createContentImporter,
  explainFailure,
  type ImportOutcome,
  spawnImporter,
} from './contentImport.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const status = (entryCount: number) => ({
  available: entryCount > 0,
  packs: [],
  entryCount,
  skipped: 0,
});

/** A `run` the test finishes by hand, so the running state can be observed. */
function manualRun() {
  let finish: (outcome: ImportOutcome) => void = () => undefined;
  const run = () =>
    new Promise<ImportOutcome>((resolve) => {
      finish = resolve;
    });
  return { run, finish: (outcome: ImportOutcome) => finish(outcome) };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('createContentImporter', () => {
  it('starts idle', () => {
    const importer = createContentImporter({
      run: () => Promise.resolve({ ok: true }),
      reload: () => status(0),
    });
    expect(importer.status()).toEqual({ state: 'idle' });
  });

  it('runs, reloads the compendium, and reports how many entries it now holds', async () => {
    const { run, finish } = manualRun();
    let reloads = 0;
    const importer = createContentImporter({
      run,
      reload: () => {
        reloads += 1;
        return status(3107);
      },
      now: () => NOW,
    });

    expect(importer.start()).toBe('started');
    expect(importer.status()).toEqual({ state: 'running', startedAt: NOW.toISOString() });
    expect(reloads).toBe(0);

    finish({ ok: true });
    await settle();

    expect(reloads).toBe(1);
    expect(importer.status()).toEqual({
      state: 'done',
      finishedAt: NOW.toISOString(),
      entryCount: 3107,
    });
  });

  it('refuses a second start while one is running, and does not run twice', async () => {
    const { run, finish } = manualRun();
    let runs = 0;
    const importer = createContentImporter({
      run: () => {
        runs += 1;
        return run();
      },
      reload: () => status(1),
    });
    expect(importer.start()).toBe('started');
    expect(importer.start()).toBe('already-running');
    expect(runs).toBe(1);
    finish({ ok: true });
    await settle();
  });

  it('reports a failure with its message and detail, and does not reload', async () => {
    const { run, finish } = manualRun();
    let reloads = 0;
    const importer = createContentImporter({
      run,
      reload: () => {
        reloads += 1;
        return status(1);
      },
      now: () => NOW,
    });
    importer.start();
    finish({ ok: false, message: 'Could not download.', detail: 'ENOTFOUND github.com' });
    await settle();

    expect(importer.status()).toEqual({
      state: 'failed',
      finishedAt: NOW.toISOString(),
      message: 'Could not download.',
      detail: 'ENOTFOUND github.com',
    });
    expect(reloads).toBe(0);
  });

  it('can be started again after a failure or a success', async () => {
    let outcome: ImportOutcome = { ok: false, message: 'no' };
    const importer = createContentImporter({
      run: () => Promise.resolve(outcome),
      reload: () => status(5),
    });
    importer.start();
    await settle();
    expect(importer.status().state).toBe('failed');

    outcome = { ok: true };
    expect(importer.start()).toBe('started');
    await settle();
    expect(importer.status().state).toBe('done');
    expect(importer.start()).toBe('started');
    await settle();
  });

  it('turns a run that throws, or a reload that throws, into a failure rather than a crash', async () => {
    const throwingRun = createContentImporter({
      run: () => Promise.reject(new Error('kaboom')),
      reload: () => status(1),
    });
    throwingRun.start();
    await settle();
    expect(throwingRun.status()).toMatchObject({
      state: 'failed',
      message: 'The import stopped unexpectedly.',
      detail: 'kaboom',
    });

    const throwingReload = createContentImporter({
      run: () => Promise.resolve({ ok: true }),
      reload: () => {
        throw new Error('bad pack');
      },
    });
    throwingReload.start();
    await settle();
    expect(throwingReload.status()).toMatchObject({
      state: 'failed',
      message: 'The content was downloaded but could not be loaded.',
      detail: 'bad pack',
    });
  });
});

describe('explainFailure', () => {
  it('names a missing Git', () => {
    expect(explainFailure('Error: spawnSync git ENOENT')).toMatch(/Git is not installed/);
  });

  it('names a checksum mismatch, and says nothing was imported', () => {
    expect(explainFailure('Error: packs checksum mismatch')).toMatch(
      /nothing was imported/,
    );
  });

  it('names a network problem', () => {
    expect(explainFailure('fatal: unable to access https://github.com/')).toMatch(
      /internet connection/,
    );
    expect(explainFailure('getaddrinfo ENOTFOUND github.com')).toMatch(
      /internet connection/,
    );
  });

  it('falls back to a plain sentence for anything else', () => {
    expect(explainFailure('something odd')).toBe('The import failed.');
  });
});

describe('spawnImporter -- with a real child process', () => {
  const node = process.execPath;
  const run = (script: string, timeoutMs = 20_000) =>
    spawnImporter({
      command: node,
      args: ['-e', script],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs,
    })();

  it('names a missing working folder instead of reporting a bare ENOENT', async () => {
    const outcome = await spawnImporter({
      command: node,
      args: ['-e', ''],
      cwd: join(process.cwd(), 'no-such-folder'),
      env: process.env,
      timeoutMs: 20_000,
    })();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.detail).toContain('importer folder was not found');
  });

  it('succeeds when the process exits 0', async () => {
    expect(await run('console.log("done")')).toEqual({ ok: true });
  });

  it('fails with the explained message and the last lines of output on a nonzero exit', async () => {
    const outcome = await run(
      'console.error("fatal: unable to access the repo"); process.exit(1)',
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.message).toMatch(/internet/);
    expect(outcome.ok ? '' : outcome.detail).toContain('unable to access');
  });

  it('keeps only the last few lines of a long output as detail', async () => {
    const outcome = await run(
      'for (let i = 0; i < 100; i++) console.error("line " + i); process.exit(1)',
    );
    const detail = outcome.ok ? '' : (outcome.detail ?? '');
    expect(detail.split('\n')).toHaveLength(8);
    expect(detail).toContain('line 99');
    expect(detail).not.toContain('line 50');
  });

  it('stops a process that takes too long, and says so', async () => {
    const outcome = await run('setInterval(() => undefined, 1000)', 300);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.message).toMatch(/too long/);
  });

  it('reports a program that cannot start', async () => {
    const outcome = await spawnImporter({
      command: join(tmpdir(), 'no-such-program-hearthtable'),
      args: [],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 5000,
    })();
    expect(outcome).toMatchObject({ ok: false, message: 'The import could not start.' });
  });
});

describe('createReloadableCompendium', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hearthtable-reload-test-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writePack(entryCount: number): void {
    const packDir = join(root, 'equipment');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'pack.json'),
      JSON.stringify({
        packId: 'equipment',
        name: 'equipment',
        upstream: { repo: 'invented/repo', commit: 'abc123', packsChecksum: 'sha256:00' },
        entryCount,
        generatedAt: '2026-09-30T00:00:00.000Z',
      }),
    );
    for (let i = 0; i < entryCount; i += 1) {
      writeFileSync(
        join(packDir, `invented-rope-${i}.json`),
        JSON.stringify({
          id: crypto.randomUUID(),
          schemaVersion: 1,
          createdAt: '2026-09-30T00:00:00.000Z',
          updatedAt: '2026-09-30T00:00:00.000Z',
          packId: 'equipment',
          slug: `invented-rope-${i}`,
          name: `Invented Rope ${i}`,
          kind: 'gear',
          provenance: {
            publication: 'Pathfinder Player Core',
            license: 'ORC',
            remaster: true,
          },
          traits: [],
          ruleElements: [],
          description: '',
        }),
      );
    }
  }

  it('starts empty when nothing is there, then sees content written afterwards without being rebuilt', () => {
    const compendium = createReloadableCompendium(join(root, 'not-yet'));
    expect(compendium.status().available).toBe(false);
    expect(compendium.search()).toEqual([]);

    // Same object, the way the app and the realtime layer hold it.
    const lateRoot = root;
    const late = createReloadableCompendium(lateRoot);
    expect(late.status().entryCount).toBe(0);
    writePack(2);
    const status = late.reload();

    expect(status.available).toBe(true);
    expect(late.status().entryCount).toBe(2);
    expect(late.search({ q: 'rope' })).toHaveLength(2);
    expect(late.get('equipment', 'invented-rope-1')?.name).toBe('Invented Rope 1');
  });

  it('replaces what it held rather than adding to it', () => {
    writePack(3);
    const compendium = createReloadableCompendium(root);
    expect(compendium.status().entryCount).toBe(3);

    rmSync(root, { recursive: true, force: true });
    writePack(1);
    compendium.reload();

    expect(compendium.status().entryCount).toBe(1);
    expect(compendium.get('equipment', 'invented-rope-2')).toBeUndefined();
  });
});
