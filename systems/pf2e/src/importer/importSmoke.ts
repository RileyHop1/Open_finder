/**
 * CI's `import-smoke` job entry point (Stack F): runs the real importer
 * against the real, pinned upstream repo and asserts the aggregate
 * invariants CI cares about. This is the only place in the repo that both
 * performs a real network fetch and is safe to run in CI -- everything it
 * prints is `CoverageAggregate`, the one shape stripped down to bare
 * counts with no entry name or slug (ADR 0003; see `coverageReport.ts`'s
 * module doc, which names this file as its intended caller).
 *
 * Mirrors `index.ts`'s shape (env-driven configuration, real side effects,
 * a nonzero exit code on failure) but is a separate entry point rather
 * than an `index.ts` flag: a local `pnpm import` run is a maintainer
 * re-importing on purpose and should never fail just because a drop rate
 * crept up, while CI's smoke run exists specifically to catch that.
 *
 * The checksum match and "zero schema validation failures" invariants
 * this job is supposed to assert need no code here at all -- `runImporter`
 * and `writePacks` already throw on either, which this script's `catch`
 * turns into a nonzero exit. What's left to check explicitly is what
 * *wouldn't* otherwise throw: every pack kept at least one entry, and the
 * dependency-drop rate stayed under a sane ceiling.
 */

import { join } from 'node:path';

import { runImporter } from './runImporter.js';
import { UPSTREAM_COMMIT, UPSTREAM_PACKS_CHECKSUM, UPSTREAM_REPO } from './upstream.js';

/**
 * Above this fraction of read entries dropped by dependency resolution,
 * something is almost certainly wrong (an over-eager scope exclusion, a
 * mis-resolved reference graph) rather than the expected handful of
 * excluded-book-adjacent orphans. A real run against the current pin drops
 * well under 1%; 10% leaves generous headroom before this starts failing
 * on normal upstream churn.
 */
const MAX_DEPENDENCY_DROP_RATE = 0.1;

/** Player Core's eight classes plus Player Core 2's eight. */
const EXPECTED_CLASS_COUNT = 16;

const upstreamDir =
  process.env.HEARTHTABLE_PF2E_UPSTREAM_DIR ?? join(process.cwd(), '.data', 'upstream');
const outputDir =
  process.env.HEARTHTABLE_PF2E_OUTPUT_DIR ?? join(process.cwd(), '.data', 'imported');

try {
  const summary = runImporter({
    upstream: {
      repo: UPSTREAM_REPO,
      commit: UPSTREAM_COMMIT,
      packsChecksum: UPSTREAM_PACKS_CHECKSUM,
    },
    upstreamDir,
    outputDir,
    skipFetch: process.argv.includes('--skip-fetch'),
    importedAt: new Date().toISOString(),
  });

  const failures: string[] = [];

  const emptyPacks = summary.packs.filter((pack) => pack.entryCount === 0);
  if (emptyPacks.length > 0) {
    failures.push(
      `pack(s) with zero kept entries: ${emptyPacks.map((pack) => pack.packId).join(', ')}`,
    );
  }

  // The core four books hold exactly sixteen classes (CLAUDE.md, Content scope).
  // A class whose upstream shape stopped matching `mapClass` fails closed and is
  // dropped, so a shortfall here is the signal that the mapping has drifted.
  const classCount = summary.packs.find((pack) => pack.packId === 'classes')?.entryCount;
  if (classCount === undefined || classCount < EXPECTED_CLASS_COUNT) {
    failures.push(
      `expected ${EXPECTED_CLASS_COUNT} classes, imported ${classCount ?? 0}`,
    );
  }

  const dependencyDropRate =
    summary.totalRead === 0 ? 0 : summary.dependencyDropped / summary.totalRead;
  if (dependencyDropRate > MAX_DEPENDENCY_DROP_RATE) {
    failures.push(
      `dependency-drop rate ${(dependencyDropRate * 100).toFixed(1)}% exceeds the ${(MAX_DEPENDENCY_DROP_RATE * 100).toFixed(0)}% threshold (${summary.dependencyDropped} of ${summary.totalRead} read)`,
    );
  }

  // The only shape this job may print -- see the module doc.
  console.log(JSON.stringify(summary.coverage, null, 2));

  if (failures.length > 0) {
    console.error('import-smoke failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
  }
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
