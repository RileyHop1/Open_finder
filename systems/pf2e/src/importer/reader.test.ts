import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readUpstreamEntries } from './reader.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearthtable-reader-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A synthetic, invented fixture -- not real upstream content. See
// docs/adr/0013-golden-test-methodology.md: importer tests run against
// fixtures we author ourselves.
const SYNTHETIC_FEAT = {
  _id: 'aaaaaaaaaaaaaaaa',
  img: 'icons/whatever.webp',
  name: 'Invented Feat',
  type: 'feat',
  system: {
    level: { value: 1 },
    publication: { title: 'Pathfinder Player Core', license: 'ORC', remaster: true },
  },
};

describe('readUpstreamEntries', () => {
  it('reads a well-formed entry into the loose shape', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'invented-feat.json'), JSON.stringify(SYNTHETIC_FEAT));

    const entries = readUpstreamEntries(dir);
    expect(entries).toEqual([
      {
        path: 'invented-feat.json',
        id: SYNTHETIC_FEAT._id,
        name: SYNTHETIC_FEAT.name,
        type: SYNTHETIC_FEAT.type,
        system: SYNTHETIC_FEAT.system,
        items: [],
      },
    ]);
  });

  it("reads an actor's embedded items array, when present", () => {
    const dir = makeTempDir();
    const embeddedItem = {
      _id: 'cccccccccccccccc',
      name: 'Invented Claw',
      type: 'melee',
    };
    writeFileSync(
      join(dir, 'invented-creature.json'),
      JSON.stringify({ ...SYNTHETIC_FEAT, type: 'npc', items: [embeddedItem] }),
    );

    const entries = readUpstreamEntries(dir);
    expect(entries[0]!.items).toEqual([embeddedItem]);
  });

  it('recurses into nested pack subdirectories, normalizing the path', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'feats'));
    writeFileSync(
      join(dir, 'feats', 'invented-feat.json'),
      JSON.stringify(SYNTHETIC_FEAT),
    );

    const entries = readUpstreamEntries(dir);
    expect(entries[0]!.path).toBe('feats/invented-feat.json');
  });

  it('ignores non-JSON files entirely', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'README.md'), '# not an entry');
    writeFileSync(join(dir, 'invented-feat.json'), JSON.stringify(SYNTHETIC_FEAT));

    expect(readUpstreamEntries(dir)).toHaveLength(1);
  });

  it('skips a folder-metadata file (a top-level array) without erroring', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, '_folders.json'),
      // Real upstream folder files are an array of folder objects, each of
      // which may itself carry a `type` -- the array wrapper is what makes
      // this not an entry, not the absence of `type`.
      JSON.stringify([{ _id: 'bbbbbbbbbbbbbbbb', name: 'A Folder', type: 'Item' }]),
    );
    writeFileSync(join(dir, 'invented-feat.json'), JSON.stringify(SYNTHETIC_FEAT));

    const entries = readUpstreamEntries(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('Invented Feat');
  });

  it('skips a well-formed object missing _id, name, or type', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, 'incomplete.json'),
      JSON.stringify({ name: 'No id or type' }),
    );

    expect(readUpstreamEntries(dir)).toEqual([]);
  });

  it('throws on malformed JSON, naming the offending file, rather than skipping it', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'broken.json'), '{ this is not valid json');

    expect(() => readUpstreamEntries(dir)).toThrow(/broken\.json/);
  });

  it('returns entries sorted by path, regardless of directory-listing order', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ ...SYNTHETIC_FEAT, name: 'B' }));
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ ...SYNTHETIC_FEAT, name: 'A' }));

    const entries = readUpstreamEntries(dir);
    expect(entries.map((e) => e.path)).toEqual(['a.json', 'b.json']);
  });
});
