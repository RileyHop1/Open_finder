/**
 * The coverage report (ADR 0004 decision 5): how much of what upstream
 * offered actually made it through the importer's v1 rule-element subset,
 * broken down by upstream element kind, by why anything went inert, by
 * dependency-drop cause, and by publication. This is what answers
 * CLAUDE.md's open question -- "which rule-element types beyond the v1
 * subset are worth the cost" -- with real numbers instead of a guess.
 *
 * **Two projections, two audiences.** `CoverageReport.drops` names entries
 * by slug -- useful for a maintainer reading `coverage.md` locally, but an
 * entry's slug derives from Paizo's published content, so this detailed
 * shape must never be printed by CI (`docs/adr/0003-rules-data-licensing.md`).
 * `aggregateCoverage` strips every name down to bare counts -- the only
 * shape CI's `import-smoke` job (a later PR) is allowed to print.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pf2eEntry } from '../content/entry.js';
import type { DependencyDrop } from './resolveDependencies.js';

export interface InertElementCount {
  readonly upstreamKind: string;
  readonly reason: string;
  readonly count: number;
}

export interface DropRecord {
  readonly slug: string;
  readonly kind: string;
  readonly reason: string;
  readonly round: number;
}

export interface CoverageReport {
  readonly totalEntries: number;
  readonly entriesByPublication: Readonly<Record<string, number>>;
  readonly ruleElementsByKind: Readonly<Record<string, number>>;
  readonly inertRuleElements: readonly InertElementCount[];
  readonly drops: readonly DropRecord[];
}

export interface CoverageAggregate {
  readonly totalEntries: number;
  readonly entriesByPublication: Readonly<Record<string, number>>;
  readonly ruleElementsByKind: Readonly<Record<string, number>>;
  readonly inertRuleElements: readonly InertElementCount[];
  readonly dropCount: number;
  readonly dropsByReason: Readonly<Record<string, number>>;
  readonly dropsByKind: Readonly<Record<string, number>>;
  readonly dropsByRound: Readonly<Record<string, number>>;
}

function countBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Grouped by `(upstreamKind, reason)` pair -- never by entry, so this list
 * is already aggregate-safe even inside the detailed `CoverageReport`. A
 * nested map (keyed first by `upstreamKind`, then by `reason`) avoids
 * needing any joined-string composite key, and the escaping that would
 * require, entirely.
 */
function countInertElements(entries: readonly Pf2eEntry[]): readonly InertElementCount[] {
  const countsByUpstreamKind = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    for (const element of entry.ruleElements) {
      if (element.kind === 'inert') {
        const countsByReason =
          countsByUpstreamKind.get(element.upstreamKind) ?? new Map<string, number>();
        countsByReason.set(element.reason, (countsByReason.get(element.reason) ?? 0) + 1);
        countsByUpstreamKind.set(element.upstreamKind, countsByReason);
      }
    }
  }

  const result: InertElementCount[] = [];
  for (const [upstreamKind, countsByReason] of countsByUpstreamKind) {
    for (const [reason, count] of countsByReason) {
      result.push({ upstreamKind, reason, count });
    }
  }
  return result.sort(
    (a, b) => b.count - a.count || a.upstreamKind.localeCompare(b.upstreamKind),
  );
}

export function buildCoverageReport(
  entries: readonly Pf2eEntry[],
  drops: readonly DependencyDrop[],
): CoverageReport {
  const mappedElements = entries
    .flatMap((entry) => entry.ruleElements)
    .filter((element) => element.kind !== 'inert');

  return {
    totalEntries: entries.length,
    entriesByPublication: countBy(entries, (entry) => entry.provenance.publication),
    ruleElementsByKind: countBy(mappedElements, (element) => element.kind),
    inertRuleElements: countInertElements(entries),
    drops: [...drops]
      .map((drop) => ({
        slug: drop.slug,
        kind: drop.kind,
        reason: drop.reason,
        round: drop.round,
      }))
      .sort((a, b) => a.round - b.round || a.slug.localeCompare(b.slug)),
  };
}

/** Strips every entry-identifying field (`drops[].slug`) down to bare counts -- see the module doc. */
export function aggregateCoverage(report: CoverageReport): CoverageAggregate {
  return {
    totalEntries: report.totalEntries,
    entriesByPublication: report.entriesByPublication,
    ruleElementsByKind: report.ruleElementsByKind,
    inertRuleElements: report.inertRuleElements,
    dropCount: report.drops.length,
    dropsByReason: countBy(report.drops, (drop) => drop.reason),
    dropsByKind: countBy(report.drops, (drop) => drop.kind),
    dropsByRound: countBy(report.drops, (drop) => String(drop.round)),
  };
}

function renderCountTable(counts: Readonly<Record<string, number>>): string {
  const rows = Object.entries(counts).sort(([, a], [, b]) => b - a);
  if (rows.length === 0) {
    return '_none_\n';
  }
  return rows.map(([key, count]) => `- \`${key}\`: ${count}`).join('\n') + '\n';
}

/**
 * The developer-facing rendering -- readable entry by entry, the property
 * ADR 0006 predicts a four-book scope keeps small enough to actually read.
 * Never printed by CI; see the module doc.
 */
export function renderCoverageMarkdown(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push('# Importer coverage report', '');
  lines.push(`Total entries kept: ${report.totalEntries}`, '');

  lines.push('## Entries by publication', '');
  lines.push(renderCountTable(report.entriesByPublication));

  lines.push('## Rule elements mapped, by kind', '');
  lines.push(renderCountTable(report.ruleElementsByKind));

  lines.push('## Rule elements gone inert, by upstream kind and reason', '');
  if (report.inertRuleElements.length === 0) {
    lines.push('_none_', '');
  } else {
    for (const { upstreamKind, reason, count } of report.inertRuleElements) {
      lines.push(`- \`${upstreamKind}\` (${reason}): ${count}`);
    }
    lines.push('');
  }

  lines.push(`## Dependency drops (${report.drops.length} total)`, '');
  if (report.drops.length === 0) {
    lines.push('_none_', '');
  } else {
    lines.push('| round | kind | slug | reason |', '|---|---|---|---|');
    for (const drop of report.drops) {
      lines.push(`| ${drop.round} | ${drop.kind} | \`${drop.slug}\` | ${drop.reason} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Writes `coverage.json` (the detailed `CoverageReport`) and `coverage.md` (its rendering) to `outputDir`. */
export function writeCoverageReport(report: CoverageReport, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'coverage.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputDir, 'coverage.md'), renderCoverageMarkdown(report));
}
