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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAGICAL_TRADITIONS } from '../content/spell.js';
import { runImporter } from './runImporter.js';
import {
  UPSTREAM_COMMIT,
  UPSTREAM_LANG_CHECKSUM,
  UPSTREAM_PACKS_CHECKSUM,
  UPSTREAM_RE_LANG_CHECKSUM,
  UPSTREAM_REPO,
} from './upstream.js';

/**
 * Above this fraction of read entries dropped by dependency resolution,
 * something is almost certainly wrong (an over-eager scope exclusion, a
 * mis-resolved reference graph) rather than the expected handful of
 * excluded-book-adjacent orphans. A real run against the current pin drops
 * about 0.5%; 2% leaves headroom for upstream churn but would have caught the
 * grant-by-name bug, which dropped 4.3% while this said 10%.
 */
const MAX_DEPENDENCY_DROP_RATE = 0.02;

/** Player Core's eight classes plus Player Core 2's eight. */
const EXPECTED_CLASS_COUNT = 16;

/** Sixteen classes with a dozen or more features each; a floor, not a count. */
const EXPECTED_MIN_CLASS_FEATURES = 100;

/** Player Core's arcane schools with a curriculum (every one but Unified Magical Theory). */
const EXPECTED_CURRICULUM_SCHOOLS = 6;

/** A curriculum's ranks: the cantrips (`"0"`) and 1 to 9. */
const CURRICULUM_RANKS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The JSON entries in an output pack directory (its `pack.json` left out). */
function readPack(dir: string): unknown[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json') && f !== 'pack.json')
        .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown)
    : [];
}

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
      langChecksum: UPSTREAM_LANG_CHECKSUM,
      reLangChecksum: UPSTREAM_RE_LANG_CHECKSUM,
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

  // Class features are `feat` items upstream, routed to their own mapper. A
  // shape drift would silently leave this pack empty (or absent), so ask for it.
  const featureCount = summary.packs.find(
    (pack) => pack.packId === 'classFeatures',
  )?.entryCount;
  if (featureCount === undefined || featureCount < EXPECTED_MIN_CLASS_FEATURES) {
    failures.push(
      `expected at least ${EXPECTED_MIN_CLASS_FEATURES} class features, imported ${featureCount ?? 0}`,
    );
  }

  // Every tradition's list must have spells. The importer once read traditions from a
  // field upstream does not have, and every spell came through on no list at all.
  const spellsDir = join(outputDir, 'spells');
  const perTradition = new Map<string, number>(MAGICAL_TRADITIONS.map((t) => [t, 0]));
  if (existsSync(spellsDir)) {
    for (const file of readdirSync(spellsDir).filter((f) => f.endsWith('.json'))) {
      const spell = JSON.parse(readFileSync(join(spellsDir, file), 'utf8')) as {
        traditions?: unknown;
      };
      for (const tradition of Array.isArray(spell.traditions) ? spell.traditions : []) {
        if (typeof tradition === 'string' && perTradition.has(tradition)) {
          perTradition.set(tradition, (perTradition.get(tradition) ?? 0) + 1);
        }
      }
    }
  }
  const emptyTraditions = [...perTradition].filter(([, n]) => n === 0).map(([t]) => t);
  if (emptyTraditions.length > 0) {
    failures.push(`no spells on the ${emptyTraditions.join(', ')} list(s)`);
  }

  // Every arcane school's curriculum is read whole from its text, and names only
  // spells that were imported (`readCurriculum.ts`); counts only, never a slug.
  const spellSlugs = new Set(
    readPack(spellsDir).map((e) => (e as { slug?: unknown }).slug),
  );
  const curricula = readPack(join(outputDir, 'classFeatures')).flatMap((e) => {
    const curriculum = (e as { curriculum?: Record<string, unknown> }).curriculum;
    return curriculum === undefined ? [] : [curriculum];
  });
  const partial = curricula.filter((c) => CURRICULUM_RANKS.some((r) => !(r in c)));
  const unknownSpells = curricula
    .flatMap((c) =>
      Object.values(c).flatMap((v): unknown[] =>
        Array.isArray(v) ? (v as unknown[]) : [],
      ),
    )
    .filter((slug) => !spellSlugs.has(slug)).length;
  if (curricula.length < EXPECTED_CURRICULUM_SCHOOLS || partial.length > 0) {
    failures.push(
      `expected ${EXPECTED_CURRICULUM_SCHOOLS} whole curricula, read ${curricula.length} (${partial.length} missing a rank)`,
    );
  }
  if (unknownSpells > 0) {
    failures.push(`${unknownSpells} curriculum spell(s) name no imported spell`);
  }

  // Every rule-element label key resolves from the pinned lang files; a guess means
  // the keys and the strings have drifted apart.
  if (summary.labelsGuessed > 0) {
    failures.push(
      `${summary.labelsGuessed} rule-element label key(s) had no lang string`,
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
