import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { RuleElement } from '@hearthtable/core';

import type { FeatEntry } from '../content/feat.js';
import {
  aggregateCoverage,
  buildCoverageReport,
  renderCoverageMarkdown,
  writeCoverageReport,
  type CoverageReport,
} from './coverageReport.js';
import { deterministicId } from './deterministicId.js';
import type { DependencyDrop } from './resolveDependencies.js';

// Synthetic, invented fixtures throughout (ADR 0013).
function makeFeat(
  upstreamId: string,
  publication: string,
  ruleElements: readonly RuleElement[] = [],
): FeatEntry {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: '2026-09-29T00:00:00.000Z',
    updatedAt: '2026-09-29T00:00:00.000Z',
    packId: 'feats',
    slug: `invented-feat-${upstreamId}`,
    name: `Invented Feat ${upstreamId}`,
    kind: 'feat',
    provenance: { publication, license: 'ORC', remaster: true },
    traits: [],
    ruleElements,
    description: '',
    level: 1,
    category: 'general',
    prerequisites: [],
  };
}

const FLAT_MODIFIER: RuleElement = {
  kind: 'flatModifier',
  selector: 'ac',
  label: 'Invented Bonus',
  type: 'status',
  value: 1,
};
const INERT_FORMULA: RuleElement = {
  kind: 'inert',
  upstreamKind: 'FlatModifier',
  reason: 'formula-value',
};
const INERT_UNMAPPED: RuleElement = {
  kind: 'inert',
  upstreamKind: 'TokenImage',
  reason: 'unmapped-element-kind',
};

describe('buildCoverageReport', () => {
  it('counts entries by publication', () => {
    const entries = [
      makeFeat('aaaaaaaaaaaaaaaa', 'Pathfinder Player Core'),
      makeFeat('bbbbbbbbbbbbbbbb', 'Pathfinder Player Core'),
      makeFeat('cccccccccccccccc', 'Pathfinder Monster Core'),
    ];

    const report = buildCoverageReport(entries, []);

    expect(report.totalEntries).toBe(3);
    expect(report.entriesByPublication).toEqual({
      'Pathfinder Player Core': 2,
      'Pathfinder Monster Core': 1,
    });
  });

  it('counts mapped rule elements by kind, excluding inert ones', () => {
    const entries = [
      makeFeat('aaaaaaaaaaaaaaaa', 'Pathfinder Player Core', [
        FLAT_MODIFIER,
        INERT_FORMULA,
      ]),
    ];

    const report = buildCoverageReport(entries, []);

    expect(report.ruleElementsByKind).toEqual({ flatModifier: 1 });
  });

  it('groups inert elements by upstream kind and reason, merging duplicates across entries', () => {
    const entries = [
      makeFeat('aaaaaaaaaaaaaaaa', 'Pathfinder Player Core', [INERT_FORMULA]),
      makeFeat('bbbbbbbbbbbbbbbb', 'Pathfinder Player Core', [
        INERT_FORMULA,
        INERT_UNMAPPED,
      ]),
    ];

    const report = buildCoverageReport(entries, []);

    expect(report.inertRuleElements).toEqual([
      { upstreamKind: 'FlatModifier', reason: 'formula-value', count: 2 },
      { upstreamKind: 'TokenImage', reason: 'unmapped-element-kind', count: 1 },
    ]);
  });

  it('carries inlineSyntaxWarnings through, defaulting to empty when none are given', () => {
    const withWarnings = buildCoverageReport([], [], ['unresolved @UUID: Compendium.x']);
    expect(withWarnings.inlineSyntaxWarnings).toEqual(['unresolved @UUID: Compendium.x']);

    const withoutWarnings = buildCoverageReport([], []);
    expect(withoutWarnings.inlineSyntaxWarnings).toEqual([]);
  });

  it('includes every drop, sorted by round then slug', () => {
    const drops: DependencyDrop[] = [
      {
        id: 'id-b',
        slug: 'b-feat',
        kind: 'feat',
        reason: 'grant-target-excluded',
        round: 2,
      },
      {
        id: 'id-a',
        slug: 'a-feat',
        kind: 'feat',
        reason: 'grant-target-excluded',
        round: 1,
      },
      {
        id: 'id-c',
        slug: 'c-feat',
        kind: 'feat',
        reason: 'grant-target-excluded',
        round: 1,
      },
    ];

    const report = buildCoverageReport([], drops);

    expect(report.drops).toEqual([
      { slug: 'a-feat', kind: 'feat', reason: 'grant-target-excluded', round: 1 },
      { slug: 'c-feat', kind: 'feat', reason: 'grant-target-excluded', round: 1 },
      { slug: 'b-feat', kind: 'feat', reason: 'grant-target-excluded', round: 2 },
    ]);
  });
});

describe('aggregateCoverage', () => {
  it('strips slugs from drops down to bare counts by reason, kind, and round', () => {
    const drops: DependencyDrop[] = [
      {
        id: 'id-a',
        slug: 'a-feat',
        kind: 'feat',
        reason: 'grant-target-excluded',
        round: 1,
      },
      {
        id: 'id-b',
        slug: 'b-heritage',
        kind: 'heritage',
        reason: 'ancestry-excluded',
        round: 1,
      },
      {
        id: 'id-c',
        slug: 'c-feat',
        kind: 'feat',
        reason: 'grant-target-excluded',
        round: 2,
      },
    ];
    const report = buildCoverageReport([], drops);

    const aggregate = aggregateCoverage(report);

    expect(aggregate.dropCount).toBe(3);
    expect(aggregate.dropsByReason).toEqual({
      'grant-target-excluded': 2,
      'ancestry-excluded': 1,
    });
    expect(aggregate.dropsByKind).toEqual({ feat: 2, heritage: 1 });
    expect(aggregate.dropsByRound).toEqual({ '1': 2, '2': 1 });
    expect(JSON.stringify(aggregate)).not.toContain('a-feat');
    expect(JSON.stringify(aggregate)).not.toContain('b-heritage');
  });

  it("strips inlineSyntaxWarnings' quoted markup down to a bare count", () => {
    const report = buildCoverageReport(
      [],
      [],
      [
        'unrecognized inline syntax, left as text: @Actor[abc]{Some Flavor Text}',
        '@Localize has no localization table here, guessed a label: PF2E.Foo',
      ],
    );

    const aggregate = aggregateCoverage(report);

    expect(aggregate.inlineSyntaxWarningCount).toBe(2);
    expect(JSON.stringify(aggregate)).not.toContain('Some Flavor Text');
  });

  it('carries totalEntries, entriesByPublication, ruleElementsByKind, and inertRuleElements through unchanged', () => {
    const entries = [
      makeFeat('aaaaaaaaaaaaaaaa', 'Pathfinder Player Core', [FLAT_MODIFIER]),
    ];
    const report = buildCoverageReport(entries, []);

    const aggregate = aggregateCoverage(report);

    expect(aggregate.totalEntries).toBe(report.totalEntries);
    expect(aggregate.entriesByPublication).toEqual(report.entriesByPublication);
    expect(aggregate.ruleElementsByKind).toEqual(report.ruleElementsByKind);
    expect(aggregate.inertRuleElements).toEqual(report.inertRuleElements);
  });
});

describe('renderCoverageMarkdown', () => {
  it('renders a readable report naming publications, kinds, and dropped slugs', () => {
    const entries = [
      makeFeat('aaaaaaaaaaaaaaaa', 'Pathfinder Player Core', [
        FLAT_MODIFIER,
        INERT_FORMULA,
      ]),
    ];
    const drops: DependencyDrop[] = [
      {
        id: 'id-b',
        slug: 'invented-orphan',
        kind: 'feat',
        reason: 'grant-target-excluded',
        round: 1,
      },
    ];
    const report = buildCoverageReport(entries, drops);

    const markdown = renderCoverageMarkdown(report);

    expect(markdown).toContain('Total entries kept: 1');
    expect(markdown).toContain('Pathfinder Player Core');
    expect(markdown).toContain('flatModifier');
    expect(markdown).toContain('FlatModifier');
    expect(markdown).toContain('formula-value');
    expect(markdown).toContain('invented-orphan');
    expect(markdown).toContain('grant-target-excluded');
  });

  it('renders inline syntax warnings, never dropping them silently', () => {
    const report = buildCoverageReport(
      [],
      [],
      ['unresolved @UUID with no fallback label: Compendium.x'],
    );

    const markdown = renderCoverageMarkdown(report);

    expect(markdown).toContain("Inline syntax that couldn't be fully resolved (1 total)");
    expect(markdown).toContain('unresolved @UUID with no fallback label: Compendium.x');
  });

  it('renders "_none_" placeholders for empty sections rather than blank tables', () => {
    const report = buildCoverageReport([], []);

    const markdown = renderCoverageMarkdown(report);

    expect(markdown).toContain('_none_');
  });
});

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearthtable-coverage-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('writeCoverageReport', () => {
  it('writes coverage.json (round-trippable) and coverage.md to outputDir', () => {
    const outputDir = makeTempDir();
    const report: CoverageReport = buildCoverageReport(
      [makeFeat('aaaaaaaaaaaaaaaa', 'Pathfinder Player Core', [FLAT_MODIFIER])],
      [],
    );

    writeCoverageReport(report, outputDir);

    const writtenJson: unknown = JSON.parse(
      readFileSync(join(outputDir, 'coverage.json'), 'utf8'),
    );
    expect(writtenJson).toEqual(report);

    const writtenMarkdown = readFileSync(join(outputDir, 'coverage.md'), 'utf8');
    expect(writtenMarkdown).toContain('# Importer coverage report');
  });
});
