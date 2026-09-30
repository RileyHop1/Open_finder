/**
 * The importer's entry point: reads configuration from the environment and
 * `--skip-fetch` from argv, runs `runImporter`, and prints a summary.
 *
 * Mirrors `apps/server/src/index.ts`'s shape: this file has real side
 * effects (a network fetch, filesystem writes, a nonzero exit code on
 * failure) and is deliberately not imported by any test -- `runImporter.ts`
 * holds the part that is. Run via `pnpm --filter @hearthtable/pf2e import`.
 *
 * **Never prints an entry's name or slug.** The summary this prints is
 * exactly `RunImporterSummary` -- counts and upstream `type`/reason
 * strings, nothing that derives from Paizo's published content (ADR 0003).
 * `coverage.md`, which does name entries, is written to disk for a
 * maintainer to read locally, never echoed to this console.
 */

import { join } from 'node:path';

import { runImporter } from './runImporter.js';
import { UPSTREAM_COMMIT, UPSTREAM_PACKS_CHECKSUM, UPSTREAM_REPO } from './upstream.js';

const skipFetch = process.argv.includes('--skip-fetch');

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
    skipFetch,
    importedAt: new Date().toISOString(),
  });

  console.log(`read ${summary.totalRead} upstream entries`);
  console.log(`  rejected by license filter: ${summary.rejectedByLicense}`);
  console.log(`  rejected by scope filter: ${summary.rejectedByScope}`);
  console.log(
    `  no mapper for upstream type: ${JSON.stringify(summary.noMapperForType)}`,
  );
  console.log(`  mapping failed: ${JSON.stringify(summary.mappingFailed)}`);
  console.log(`  dropped by dependency resolution: ${summary.dependencyDropped}`);
  console.log(`  dropped for a duplicate slug: ${summary.duplicatesDropped}`);
  console.log(`kept ${summary.kept} entries across ${summary.packs.length} packs`);
  for (const pack of summary.packs) {
    console.log(`  ${pack.packId}: ${pack.entryCount}`);
  }
  console.log(`wrote packs and coverage report to ${outputDir}`);
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
