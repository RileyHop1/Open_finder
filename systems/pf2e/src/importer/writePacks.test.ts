import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ActionEntry } from '../content/action.js';
import type { FeatEntry } from '../content/feat.js';
import type { Pf2eEntry } from '../content/entry.js';
import { deterministicId } from './deterministicId.js';
import { writePacks, type UpstreamPin } from './writePacks.js';

// Synthetic, invented fixtures throughout (ADR 0013), already fully
// resolved -- this stage runs after dependency resolution, so there is no
// UnresolvedGrantItem left to see here.
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const GENERATED_AT = '2026-09-29T01:00:00.000Z';
const UPSTREAM: UpstreamPin = {
  repo: 'https://github.com/foundryvtt/pf2e.git',
  commit: 'a'.repeat(40),
  packsChecksum: 'sha256:invented',
};

function makeFeat(upstreamId: string, overrides: Partial<FeatEntry> = {}): FeatEntry {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'feats',
    slug: `invented-feat-${upstreamId}`,
    name: `Invented Feat ${upstreamId}`,
    kind: 'feat',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    level: 1,
    category: 'general',
    prerequisites: [],
    ...overrides,
  };
}

function makeAction(
  upstreamId: string,
  overrides: Partial<ActionEntry> = {},
): ActionEntry {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'actions',
    slug: `invented-action-${upstreamId}`,
    name: `Invented Action ${upstreamId}`,
    kind: 'action',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    actionCost: 'one',
    ...overrides,
  };
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearthtable-writer-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('writePacks -- success', () => {
  it('writes one file per entry, readable back as the same entry', () => {
    const outputDir = makeTempDir();
    const feat = makeFeat('aaaaaaaaaaaaaaaa');

    writePacks({
      entries: [feat],
      outputDir,
      upstream: UPSTREAM,
      generatedAt: GENERATED_AT,
    });

    const written: unknown = JSON.parse(
      readFileSync(join(outputDir, 'feats', `${feat.slug}.json`), 'utf8'),
    );
    expect(written).toEqual(feat);
  });

  it('writes a pack manifest with the pin, entry count, and generatedAt', () => {
    const outputDir = makeTempDir();
    const feats = [makeFeat('aaaaaaaaaaaaaaaa'), makeFeat('bbbbbbbbbbbbbbbb')];

    writePacks({
      entries: feats,
      outputDir,
      upstream: UPSTREAM,
      generatedAt: GENERATED_AT,
    });

    const manifest: unknown = JSON.parse(
      readFileSync(join(outputDir, 'feats', 'pack.json'), 'utf8'),
    );
    expect(manifest).toEqual({
      packId: 'feats',
      name: 'Feats',
      upstream: UPSTREAM,
      entryCount: 2,
      generatedAt: GENERATED_AT,
    });
  });

  it('splits entries into separate pack directories by packId', () => {
    const outputDir = makeTempDir();
    const entries: Pf2eEntry[] = [
      makeFeat('aaaaaaaaaaaaaaaa'),
      makeAction('cccccccccccccccc'),
    ];

    const result = writePacks({
      entries,
      outputDir,
      upstream: UPSTREAM,
      generatedAt: GENERATED_AT,
    });

    expect(result.packs).toEqual([
      { packId: 'actions', entryCount: 1 },
      { packId: 'feats', entryCount: 1 },
    ]);
    expect(existsSync(join(outputDir, 'actions', 'pack.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'feats', 'pack.json'))).toBe(true);
  });

  it('falls back to the raw packId as the manifest name for an unrecognized pack', () => {
    const outputDir = makeTempDir();
    const entry = makeFeat('aaaaaaaaaaaaaaaa', { packId: 'invented-future-pack' });

    writePacks({
      entries: [entry],
      outputDir,
      upstream: UPSTREAM,
      generatedAt: GENERATED_AT,
    });

    const manifest = JSON.parse(
      readFileSync(join(outputDir, 'invented-future-pack', 'pack.json'), 'utf8'),
    ) as { name: string };
    expect(manifest.name).toBe('invented-future-pack');
  });

  it('produces byte-identical output across two runs given identical input', () => {
    const firstDir = makeTempDir();
    const secondDir = makeTempDir();
    const entries: Pf2eEntry[] = [
      makeFeat('aaaaaaaaaaaaaaaa'),
      makeAction('cccccccccccccccc'),
    ];

    writePacks({
      entries,
      outputDir: firstDir,
      upstream: UPSTREAM,
      generatedAt: GENERATED_AT,
    });
    writePacks({
      entries,
      outputDir: secondDir,
      upstream: UPSTREAM,
      generatedAt: GENERATED_AT,
    });

    for (const [packId, filename] of [
      ['feats', 'invented-feat-aaaaaaaaaaaaaaaa.json'],
      ['feats', 'pack.json'],
      ['actions', 'invented-action-cccccccccccccccc.json'],
      ['actions', 'pack.json'],
    ] as const) {
      expect(readFileSync(join(firstDir, packId, filename), 'utf8')).toBe(
        readFileSync(join(secondDir, packId, filename), 'utf8'),
      );
    }
  });
});

describe('writePacks -- fails loudly rather than writing bad or lossy output', () => {
  it('throws if an entry does not validate against its own schema', () => {
    const outputDir = makeTempDir();
    const brokenFeat = { ...makeFeat('aaaaaaaaaaaaaaaa'), level: -1 } as FeatEntry;

    expect(() =>
      writePacks({
        entries: [brokenFeat],
        outputDir,
        upstream: UPSTREAM,
        generatedAt: GENERATED_AT,
      }),
    ).toThrow(/fails its own schema/);
  });

  it('throws on a duplicate slug within the same pack rather than silently overwriting', () => {
    const outputDir = makeTempDir();
    const first = makeFeat('aaaaaaaaaaaaaaaa', { slug: 'shared-slug' });
    const second = makeFeat('bbbbbbbbbbbbbbbb', { slug: 'shared-slug' });

    expect(() =>
      writePacks({
        entries: [first, second],
        outputDir,
        upstream: UPSTREAM,
        generatedAt: GENERATED_AT,
      }),
    ).toThrow(/duplicate slug/);
  });
});
