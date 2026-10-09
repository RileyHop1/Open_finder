import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActiveWorldManager } from './activeWorld.js';
import { createApp } from './app.js';
import { emptyCompendium, loadCompendium } from './compendium.js';

let root: string;
let app: FastifyInstance;

const NOW = '2026-09-30T00:00:00.000Z';

/** See `app.test.ts`: narrows `any` from `response.json()` honestly. */
function jsonAs<T>(response: { json: () => unknown }): T {
  return response.json() as T;
}

function gear(slug: string, name: string) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'equipment',
    slug,
    name,
    kind: 'gear',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
  };
}

function importedFixture(): string {
  const dir = join(root, 'imported');
  mkdirSync(join(dir, 'equipment'), { recursive: true });
  writeFileSync(
    join(dir, 'equipment', 'pack.json'),
    JSON.stringify({
      packId: 'equipment',
      name: 'Equipment',
      upstream: { repo: 'invented/repo', commit: 'abc', packsChecksum: 'sha256:00' },
      entryCount: 2,
      generatedAt: NOW,
    }),
  );
  for (const [slug, name] of [
    ['rope', 'Rope'],
    ['torch', 'Torch'],
  ] as const) {
    writeFileSync(
      join(dir, 'equipment', `${slug}.json`),
      JSON.stringify(gear(slug, name)),
    );
  }
  writeFileSync(
    join(dir, 'traits.json'),
    JSON.stringify([
      { slug: 'agile', name: 'Agile', text: [{ kind: 'text', value: 'Reduces MAP.' }] },
    ]),
  );
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hearthtable-app-compendium-test-'));
});

afterEach(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

function build(compendium?: ReturnType<typeof loadCompendium>): void {
  app = createApp({
    worldsRoot: join(root, 'worlds'),
    activeWorld: createActiveWorldManager(),
    logger: false,
    ...(compendium === undefined ? {} : { compendium }),
  });
}

describe('with imported content', () => {
  beforeEach(() => {
    build(loadCompendium(importedFixture()));
  });

  it('GET /api/compendium reports what is available', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/compendium' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      available: true,
      entryCount: 2,
      skipped: 0,
      packs: [{ packId: 'equipment' }],
    });
  });

  it('GET /api/compendium/search returns summaries, filtered and ranked', async () => {
    const all = await app.inject({ method: 'GET', url: '/api/compendium/search' });
    expect(jsonAs<{ name: string }[]>(all).map((e) => e.name)).toEqual(['Rope', 'Torch']);

    const some = await app.inject({
      method: 'GET',
      url: '/api/compendium/search?q=tor&kind=gear&limit=5',
    });
    expect(some.json()).toEqual([
      { packId: 'equipment', slug: 'torch', name: 'Torch', kind: 'gear', traits: [] },
    ]);
  });

  it('rejects a malformed search query with 400', async () => {
    for (const query of [
      'limit=0',
      'limit=9999',
      'limit=abc',
      'kind=',
      'level=0',
      'level=21',
      'maxLevel=abc',
      'category=',
      'trait=',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/compendium/search?${query}`,
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('GET /api/compendium/:packId/:slug returns the full entry', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/compendium/equipment/rope',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ kind: 'gear', name: 'Rope', slug: 'rope' });
  });

  it('GET /api/compendium/traits returns the whole glossary, not per-slug', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/compendium/traits' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { slug: 'agile', name: 'Agile', text: [{ kind: 'text', value: 'Reduces MAP.' }] },
    ]);
  });

  it('returns 404 for an unknown entry, including a path-like slug', async () => {
    for (const url of [
      '/api/compendium/equipment/nope',
      '/api/compendium/nope/rope',
      '/api/compendium/equipment/..%2Frope',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
    }
  });
});

describe('without imported content', () => {
  it('still answers, saying nothing is available', async () => {
    build();
    const status = await app.inject({ method: 'GET', url: '/api/compendium' });
    expect(status.json()).toEqual({
      available: false,
      packs: [],
      entryCount: 0,
      skipped: 0,
    });
    const search = await app.inject({
      method: 'GET',
      url: '/api/compendium/search?q=rope',
    });
    expect(search.json()).toEqual([]);
    const entry = await app.inject({
      method: 'GET',
      url: '/api/compendium/equipment/rope',
    });
    expect(entry.statusCode).toBe(404);
    const traits = await app.inject({ method: 'GET', url: '/api/compendium/traits' });
    expect(traits.json()).toEqual([]);
  });

  it('treats an explicitly empty compendium the same way', async () => {
    build(emptyCompendium());
    const status = await app.inject({ method: 'GET', url: '/api/compendium' });
    expect(jsonAs<{ available: boolean }>(status).available).toBe(false);
  });
});
