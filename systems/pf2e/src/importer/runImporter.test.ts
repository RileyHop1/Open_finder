import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checksumPacks } from './checksum.js';
import { runImporter, type RunImporterOptions } from './runImporter.js';

// Synthetic, invented fixtures throughout (ADR 0013) -- a small on-disk
// packs/ directory this test builds itself, never real upstream content.
const PLAYER_CORE_ITEM_PROVENANCE = {
  title: 'Pathfinder Player Core',
  license: 'ORC',
  remaster: true,
};

const KEPT_FEAT = {
  _id: '1111111111111111',
  name: 'Invented Toughness',
  type: 'feat',
  system: {
    level: { value: 1 },
    category: 'general',
    publication: PLAYER_CORE_ITEM_PROVENANCE,
  },
};

const LICENSE_REJECTED_FEAT = {
  _id: '2222222222222222',
  name: 'Invented Legacy Feat',
  type: 'feat',
  system: {
    level: { value: 1 },
    category: 'general',
    publication: { title: 'Pathfinder Player Core', license: 'ORC', remaster: false },
  },
};

const SCOPE_REJECTED_FEAT = {
  _id: '3333333333333333',
  name: 'Invented Kineticist Feat',
  type: 'feat',
  system: {
    level: { value: 1 },
    category: 'general',
    publication: { title: 'Pathfinder Rage of Elements', license: 'ORC', remaster: true },
  },
};

const NO_MAPPER_HAZARD = {
  _id: '4444444444444444',
  name: 'Invented Hazard',
  type: 'hazard',
  system: { details: { publication: PLAYER_CORE_ITEM_PROVENANCE } },
};

const MAPPING_FAILED_FEAT = {
  _id: '5555555555555555',
  name: 'Invented Feat Missing Level',
  type: 'feat',
  system: { category: 'general', publication: PLAYER_CORE_ITEM_PROVENANCE },
};

const DEPENDENCY_DROPPED_FEAT = {
  _id: '6666666666666666',
  name: 'Invented Grants Nothing Real',
  type: 'feat',
  system: {
    level: { value: 1 },
    category: 'general',
    publication: PLAYER_CORE_ITEM_PROVENANCE,
    rules: [{ key: 'GrantItem', uuid: 'Compendium.pf2e.feats.Item.9999999999999999' }],
  },
};

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearthtable-run-importer-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Writes every fixture to `<upstreamDir>/packs/<n>.json` and returns options with a `packsChecksum` computed for exactly this fixture set. */
function setUpstreamFixture(
  entries: readonly unknown[],
): Pick<RunImporterOptions, 'upstream' | 'upstreamDir'> {
  const upstreamDir = makeTempDir();
  const packsDir = join(upstreamDir, 'packs');
  mkdirSync(packsDir, { recursive: true });
  entries.forEach((entry, index) => {
    writeFileSync(join(packsDir, `${index}.json`), JSON.stringify(entry));
  });

  return {
    upstreamDir,
    upstream: {
      repo: 'https://example.invalid/test-repo.git',
      commit: 'a'.repeat(40),
      packsChecksum: checksumPacks(packsDir),
    },
  };
}

describe('runImporter', () => {
  it('runs the whole pipeline end to end, counting every outcome correctly', () => {
    const { upstream, upstreamDir } = setUpstreamFixture([
      KEPT_FEAT,
      LICENSE_REJECTED_FEAT,
      SCOPE_REJECTED_FEAT,
      NO_MAPPER_HAZARD,
      MAPPING_FAILED_FEAT,
      DEPENDENCY_DROPPED_FEAT,
    ]);
    const outputDir = makeTempDir();

    const summary = runImporter({
      upstream,
      upstreamDir,
      outputDir,
      skipFetch: true,
      importedAt: '2026-09-29T00:00:00.000Z',
    });

    expect(summary.totalRead).toBe(6);
    expect(summary.rejectedByLicense).toBe(1);
    expect(summary.rejectedByScope).toBe(1);
    expect(summary.noMapperForType).toEqual({ hazard: 1 });
    expect(summary.mappingFailed).toEqual({ 'missing-or-invalid-level': 1 });
    expect(summary.dependencyDropped).toBe(1);
    expect(summary.kept).toBe(1);
    expect(summary.packs).toEqual([{ packId: 'feats', entryCount: 1 }]);
  });

  it('writes packs and a coverage report to outputDir', () => {
    const { upstream, upstreamDir } = setUpstreamFixture([KEPT_FEAT]);
    const outputDir = makeTempDir();

    runImporter({
      upstream,
      upstreamDir,
      outputDir,
      skipFetch: true,
      importedAt: '2026-09-29T00:00:00.000Z',
    });

    expect(existsSync(join(outputDir, 'feats', 'invented-toughness.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'feats', 'pack.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'coverage.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'coverage.md'))).toBe(true);
  });

  it('throws on a checksum mismatch rather than importing unverified content', () => {
    const { upstreamDir } = setUpstreamFixture([KEPT_FEAT]);
    const outputDir = makeTempDir();

    expect(() =>
      runImporter({
        upstream: {
          repo: 'https://example.invalid/test-repo.git',
          commit: 'a'.repeat(40),
          packsChecksum:
            'sha256:0000000000000000000000000000000000000000000000000000000000000',
        },
        upstreamDir,
        outputDir,
        skipFetch: true,
        importedAt: '2026-09-29T00:00:00.000Z',
      }),
    ).toThrow(/checksum mismatch/);
  });
});
