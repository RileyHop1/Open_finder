/**
 * The importer pipeline, wired end to end: fetch, verify, read, filter,
 * map, resolve dependencies, write, report. Every stage this calls is
 * already unit-tested in isolation against synthetic fixtures (ADR 0013);
 * this module's own tests exercise the wiring itself -- dispatch by
 * upstream `type`, counting, and ordering -- against a small real
 * filesystem fixture, not against upstream's real (and Paizo-owned) data.
 *
 * Kept separate from `index.ts`, the same split `apps/server`'s
 * `app.ts`/`index.ts` uses: this file has no top-level side effects and is
 * safe to import from a test; `index.ts` reads the environment and argv,
 * calls this, and is the only place a real fetch or a real `process.exit`
 * happens.
 */

import type { Provenance } from '@hearthtable/core';
import { join } from 'node:path';

import { checksumPacks } from './checksum.js';
import {
  aggregateCoverage,
  buildCoverageReport,
  writeCoverageReport,
  type CoverageAggregate,
} from './coverageReport.js';
import type { DraftPf2eEntry, MapContentResult } from './draftEntry.js';
import { fetchUpstream } from './fetchUpstream.js';
import { applyLicenseFilter } from './licenseFilter.js';
import { mapAction } from './mapAction.js';
import { mapAncestry } from './mapAncestry.js';
import { mapArmor } from './mapArmor.js';
import { mapBackground } from './mapBackground.js';
import { mapClass } from './mapClass.js';
import { mapClassFeature } from './mapClassFeature.js';
import { mapCondition } from './mapCondition.js';
import { mapCreature } from './mapCreature.js';
import { mapFeat } from './mapFeat.js';
import { mapGear } from './mapGear.js';
import { mapHeritage } from './mapHeritage.js';
import { mapSpell } from './mapSpell.js';
import { mapWeapon } from './mapWeapon.js';
import { readUpstreamEntries, type UpstreamEntry } from './reader.js';
import { resolveDependencies } from './resolveDependencies.js';
import { applyScopeFilter } from './scopeFilter.js';
import { writePacks, type UpstreamPin } from './writePacks.js';

type Mapper = (
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
) => MapContentResult<DraftPf2eEntry>;

/**
 * Dispatches by upstream `type`. A `type` with no entry here isn't a
 * filter rejection -- it may well be Remaster, core-four-books content --
 * it's content this project hasn't built a content schema for yet (a GM
 * Core hazard is the real example: Stack B never added a `hazard` kind).
 * Counted separately (`RunImporterSummary.noMapperForType`) rather than
 * silently disappearing into the same bucket as a license/scope rejection.
 */
const MAPPERS: Readonly<Record<string, Mapper>> = {
  feat: mapFeat,
  action: mapAction,
  weapon: mapWeapon,
  armor: mapArmor,
  equipment: mapGear,
  spell: mapSpell,
  ancestry: mapAncestry,
  heritage: mapHeritage,
  background: mapBackground,
  class: mapClass,
  'class-feature': mapClassFeature,
  npc: mapCreature,
  condition: mapCondition,
};

export interface RunImporterOptions {
  /** The pin: which upstream commit, and the checksum its `packs/` must match. Passed in, never read from `upstream.ts` directly, so this function stays testable against a synthetic fixture whose checksum is computed for that fixture rather than a real fetch -- `index.ts` is the one real caller, and it supplies `upstream.ts`'s actual constants. */
  readonly upstream: UpstreamPin;
  /** Where the fetched upstream repo lives (its `packs/` subdirectory is read). */
  readonly upstreamDir: string;
  /** Where converted packs and the coverage report are written. */
  readonly outputDir: string;
  /** Skip `fetchUpstream` and read whatever is already in `upstreamDir`. The checksum is still re-verified either way. */
  readonly skipFetch: boolean;
  /** Threaded through every mapper and the writer -- see their own docs on why this is a parameter, never `Date.now()` read internally. */
  readonly importedAt: string;
}

export interface RunImporterSummary {
  readonly totalRead: number;
  readonly rejectedByLicense: number;
  readonly rejectedByScope: number;
  readonly noMapperForType: Readonly<Record<string, number>>;
  readonly mappingFailed: Readonly<Record<string, number>>;
  readonly dependencyDropped: number;
  readonly kept: number;
  readonly packs: readonly { readonly packId: string; readonly entryCount: number }[];
  readonly coverage: CoverageAggregate;
}

export function runImporter(options: RunImporterOptions): RunImporterSummary {
  if (!options.skipFetch) {
    fetchUpstream({
      repo: options.upstream.repo,
      commit: options.upstream.commit,
      targetDir: options.upstreamDir,
    });
  }

  const packsDir = join(options.upstreamDir, 'packs');
  const checksum = checksumPacks(packsDir);
  if (checksum !== options.upstream.packsChecksum) {
    throw new Error(
      `upstream packs checksum mismatch: expected ${options.upstream.packsChecksum}, got ${checksum} -- refusing to import unverified content`,
    );
  }

  const rawEntries = readUpstreamEntries(packsDir);

  let rejectedByLicense = 0;
  let rejectedByScope = 0;
  const noMapperForType: Record<string, number> = {};
  const mappingFailed: Record<string, number> = {};
  const drafts: DraftPf2eEntry[] = [];

  for (const entry of rawEntries) {
    const licenseResult = applyLicenseFilter(entry);
    if (!licenseResult.ok) {
      rejectedByLicense++;
      continue;
    }

    const scopeResult = applyScopeFilter(licenseResult.provenance);
    if (!scopeResult.ok) {
      rejectedByScope++;
      continue;
    }

    const mapper = MAPPERS[entry.type];
    if (mapper === undefined) {
      noMapperForType[entry.type] = (noMapperForType[entry.type] ?? 0) + 1;
      continue;
    }

    const mapped = mapper(entry, licenseResult.provenance, options.importedAt);
    if (!mapped.ok) {
      mappingFailed[mapped.reason] = (mappingFailed[mapped.reason] ?? 0) + 1;
      continue;
    }

    drafts.push(mapped.entry);
  }

  const { kept, drops } = resolveDependencies(drafts);

  const { packs } = writePacks({
    entries: kept,
    outputDir: options.outputDir,
    upstream: options.upstream,
    generatedAt: options.importedAt,
  });

  const report = buildCoverageReport(kept, drops);
  writeCoverageReport(report, options.outputDir);

  return {
    totalRead: rawEntries.length,
    rejectedByLicense,
    rejectedByScope,
    noMapperForType,
    mappingFailed,
    dependencyDropped: drops.length,
    kept: kept.length,
    packs,
    coverage: aggregateCoverage(report),
  };
}
