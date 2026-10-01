import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyCompendium, loadCompendium, MAX_SEARCH_LIMIT } from './compendium.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hearthtable-compendium-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const NOW = '2026-09-30T00:00:00.000Z';

function entry(packId: string, slug: string, name: string, kind = 'gear', extra = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId,
    slug,
    name,
    kind,
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    ...extra,
  };
}

function manifest(packId: string, entryCount: number) {
  return {
    packId,
    name: packId,
    upstream: { repo: 'invented/repo', commit: 'abc123', packsChecksum: 'sha256:00' },
    entryCount,
    generatedAt: NOW,
  };
}

/** Writes `<root>/<packId>/pack.json` and one file per entry. */
function writePack(
  packId: string,
  entries: readonly object[],
  withManifest = true,
): void {
  const dir = join(root, packId);
  mkdirSync(dir, { recursive: true });
  if (withManifest) {
    writeFileSync(
      join(dir, 'pack.json'),
      JSON.stringify(manifest(packId, entries.length)),
    );
  }
  for (const item of entries) {
    const slug = (item as { slug: string }).slug;
    writeFileSync(join(dir, `${slug}.json`), JSON.stringify(item));
  }
}

const weapon = (slug: string, name: string) =>
  entry('equipment', slug, name, 'weapon', {
    category: 'martial',
    group: 'sword',
    damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
    hands: 1,
  });

describe('loadCompendium', () => {
  it('loads every pack and entry, and reports what it found', () => {
    writePack('equipment', [
      weapon('longsword', 'Longsword'),
      entry('equipment', 'rope', 'Rope'),
    ]);
    writePack('conditions', [
      entry('conditions', 'prone', 'Prone', 'condition', { valued: false }),
    ]);

    const status = loadCompendium(root).status();

    expect(status.available).toBe(true);
    expect(status.entryCount).toBe(3);
    expect(status.packs.map((p) => p.packId).sort()).toEqual(['conditions', 'equipment']);
    expect(status.skipped).toBe(0);
  });

  it('is an empty, unavailable compendium when the directory does not exist', () => {
    const index = loadCompendium(join(root, 'never-imported'));
    expect(index.status()).toEqual({
      available: false,
      packs: [],
      entryCount: 0,
      skipped: 0,
    });
    expect(index.search()).toEqual([]);
    expect(index.get('equipment', 'longsword')).toBeUndefined();
  });

  it('is empty, not an error, for a directory with nothing in it', () => {
    expect(loadCompendium(root).status().available).toBe(false);
  });

  it('skips and counts what it cannot use instead of throwing', () => {
    writePack('equipment', [weapon('longsword', 'Longsword')]);
    // A pack with no manifest.
    writePack('orphans', [entry('orphans', 'lost', 'Lost')], false);
    // An entry that is not valid JSON, one that fails its schema, and a stray non-JSON file.
    writeFileSync(join(root, 'equipment', 'broken.json'), '{ not json');
    writeFileSync(
      join(root, 'equipment', 'wrong.json'),
      JSON.stringify(
        entry('equipment', 'wrong', 'Wrong', 'weapon', { category: 'nonsense' }),
      ),
    );
    writeFileSync(join(root, 'equipment', 'notes.txt'), 'ignore me');
    // A loose file at the root (the importer's coverage report lives there).
    writeFileSync(join(root, 'coverage-report.json'), '{}');

    const status = loadCompendium(root).status();

    expect(status.entryCount).toBe(1);
    expect(status.skipped).toBe(3);
    expect(status.packs.map((p) => p.packId)).toEqual(['equipment']);
  });
});

describe('get', () => {
  it('returns the full, validated entry by pack and slug', () => {
    writePack('equipment', [weapon('longsword', 'Longsword')]);
    const found = loadCompendium(root).get('equipment', 'longsword');
    expect(found).toMatchObject({
      kind: 'weapon',
      name: 'Longsword',
      damage: { dieFaces: 8 },
    });
  });

  it('returns undefined for an unknown entry, and never touches the filesystem for a path-like one', () => {
    writePack('equipment', [weapon('longsword', 'Longsword')]);
    const index = loadCompendium(root);
    expect(index.get('equipment', 'nope')).toBeUndefined();
    expect(index.get('equipment', '../equipment/longsword')).toBeUndefined();
    expect(index.get('..', 'equipment')).toBeUndefined();
  });
});

describe('search', () => {
  beforeEach(() => {
    writePack('equipment', [
      weapon('longsword', 'Longsword'),
      weapon('shortsword', 'Shortsword'),
      weapon('sword-cane', 'Sword Cane'),
      entry('equipment', 'rope', 'Rope'),
    ]);
    writePack('feats', [
      entry('feats', 'swordplay', 'Swordplay', 'feat', {
        level: 1,
        category: 'general',
        prerequisites: [],
      }),
    ]);
  });

  it('returns every entry, alphabetically, for an empty query', () => {
    const names = loadCompendium(root)
      .search()
      .map((e) => e.name);
    expect(names).toEqual(['Longsword', 'Rope', 'Shortsword', 'Sword Cane', 'Swordplay']);
  });

  it('matches case-insensitively and ranks names that start with the query first', () => {
    const names = loadCompendium(root)
      .search({ q: 'SWORD' })
      .map((e) => e.name);
    expect(names).toEqual(['Sword Cane', 'Swordplay', 'Longsword', 'Shortsword']);
  });

  it('filters by kind', () => {
    const index = loadCompendium(root);
    expect(index.search({ kind: 'feat' }).map((e) => e.name)).toEqual(['Swordplay']);
    expect(index.search({ kind: 'weapon', q: 'sword' })).toHaveLength(3);
    expect(index.search({ kind: 'spell' })).toEqual([]);
  });

  it('returns summaries, not whole entries', () => {
    const [first] = loadCompendium(root).search({ q: 'longsword' });
    expect(first).toEqual({
      packId: 'equipment',
      slug: 'longsword',
      name: 'Longsword',
      kind: 'weapon',
      traits: [],
    });
  });

  it('applies a limit, defaulting to 50 and capped', () => {
    const index = loadCompendium(root);
    expect(index.search({ limit: 2 })).toHaveLength(2);
    expect(index.search({ limit: 0 })).toHaveLength(1);
    expect(index.search({ limit: MAX_SEARCH_LIMIT * 10 })).toHaveLength(5);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(loadCompendium(root).search({ q: 'zzz' })).toEqual([]);
  });
});

describe('conditions', () => {
  it('lists only the condition entries, by slug', () => {
    writePack('conditions', [
      entry('conditions', 'prone', 'Prone', 'condition', { valued: false }),
      entry('conditions', 'frightened', 'Frightened', 'condition', {
        valued: true,
        maxValue: 4,
      }),
    ]);
    writePack('equipment', [entry('equipment', 'rope', 'Rope')]);

    const definitions = loadCompendium(root).conditions();

    expect([...definitions.keys()].sort()).toEqual(['frightened', 'prone']);
    expect(definitions.get('frightened')).toMatchObject({ valued: true, maxValue: 4 });
  });

  it('is empty before anything has been imported', () => {
    expect(emptyCompendium().conditions().size).toBe(0);
    expect(loadCompendium(join(root, 'never-imported')).conditions().size).toBe(0);
  });
});

describe('emptyCompendium', () => {
  it('answers every question with nothing', () => {
    const index = emptyCompendium();
    expect(index.status().available).toBe(false);
    expect(index.search({ q: 'x' })).toEqual([]);
  });
});
