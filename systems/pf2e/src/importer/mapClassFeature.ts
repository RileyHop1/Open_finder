/**
 * Maps an upstream class feature onto a draft `ClassFeatureEntry`.
 *
 * Verified against the pinned upstream data (milestone 8, W5 prep): a class
 * feature is not its own upstream type. It is a `feat` item whose
 * `system.category` is `classfeature`, in the `class-features` pack, so the
 * importer routes those here (`runImporter.ts`). Its level is
 * `system.level.value`, and the class (or classes: Weapon Mastery is shared by
 * six) it belongs to is carried as **traits** -- `system.traits.value` holds the
 * class slugs alongside any other trait. The mapper cannot tell which traits
 * are classes (it sees one entry), so it keeps them all as `classSlugs` and
 * dependency resolution (`resolveDependencies.ts`) trims them to the classes
 * that were actually kept, dropping a feature none of whose classes were.
 *
 * A feature with no traits at all fails closed: there is no such thing as a
 * class feature with no class.
 */

import type { Provenance } from '@hearthtable/core';

import {
  RANK_UP_TARGETS,
  type ClassFeatureEntry,
  type RankUpTarget,
} from '../content/class.js';
import { PROFICIENCY_RANKS, type ProficiencyRank } from '../content/common.js';
import { traitSlugSchema } from '../content/common.js';
import { readClassFeatureRules } from './classFeatureRules.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { htmlToRichText } from './htmlToRichText.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import { readCurriculum } from './readCurriculum.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  nestedNumberField,
  nestedStringArrayField,
  nestedStringField,
  slugify,
} from './upstreamHelpers.js';

/**
 * The ranks a feature raises, from upstream's `system.subfeatures.proficiencies`:
 * `{ fortitude: { rank: 2 }, light: { rank: 1 } }`, ranks 0 to 4. A key that is one
 * of the feature's own class slugs (`fighter`, `alchemist`) is that class's class
 * DC. Checked against the pinned data (2026-10-16): 100 core-book class features
 * carry this, covering every class's save, Perception, weapon, armor, class DC and
 * spellcasting rank-ups. A key we do not know, or a rank outside 0 to 4, is left
 * out rather than guessed at.
 */
function mapRankUps(
  system: Record<string, unknown>,
  classSlugs: readonly string[],
): ClassFeatureEntry['rankUps'] {
  const proficiencies = asRecord(asRecord(system.subfeatures)?.proficiencies);
  const rankUps: Partial<Record<RankUpTarget, ProficiencyRank>> = {};
  for (const [key, value] of Object.entries(proficiencies ?? {})) {
    const rank = asRecord(value)?.rank;
    const target: string = classSlugs.includes(key) ? 'classDc' : key;
    if (
      typeof rank === 'number' &&
      Number.isInteger(rank) &&
      (RANK_UP_TARGETS as readonly string[]).includes(target)
    ) {
      const name = PROFICIENCY_RANKS[rank];
      if (name !== undefined) {
        rankUps[target as RankUpTarget] = name;
      }
    }
  }
  return rankUps;
}

export function mapClassFeature(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<ClassFeatureEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const classSlugs = nestedStringArrayField(system, 'traits', 'value') ?? [];
  if (classSlugs.length === 0) {
    return { ok: false, reason: 'missing-class-trait' };
  }

  const level = nestedNumberField(system, 'level', 'value');
  if (level === undefined || level < 1) {
    return { ok: false, reason: 'missing-or-invalid-level' };
  }

  const slug =
    typeof system.slug === 'string' && system.slug.length > 0
      ? system.slug
      : slugify(entry.name);
  const traits = filterValidTraitSlugs(
    nestedStringArrayField(system, 'traits', 'value'),
    (value) => traitSlugSchema.safeParse(value).success,
  );
  const tags = nestedStringArrayField(system, 'traits', 'otherTags') ?? [];
  const description = nestedStringField(system, 'description', 'value') ?? '';
  const text = htmlToRichText(description);
  const read = readClassFeatureRules(system.rules, classSlugs);
  const { elements } = mapEntryRuleElements(read.rules);
  const curriculum = readCurriculum(description);

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'classFeatures',
      slug,
      name: entry.name,
      kind: 'classFeature',
      provenance,
      traits,
      ruleElements: elements,
      description,
      text,
      classSlugs,
      level,
      tags,
      rankUps: mapRankUps(system, classSlugs),
      skillRankUps: read.skillRankUps,
      ...(curriculum === undefined ? {} : { curriculum }),
    },
  };
}
