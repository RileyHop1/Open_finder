/**
 * Two upstream rule shapes that only a class feature can read, because they need
 * to know which class the feature belongs to (`mapClassFeature.ts` hands it over):
 *
 * - **Skill training.** `ActiveEffectLike` upgrading `system.skills.<skill>.rank`
 *   (the Thief racket trains Thievery, a methodology or bloodline its skills, a
 *   Druid order its order skill). Our subset has no skill element, so these come
 *   out as the feature's `skillRankUps`, which `deriveCharacter` applies.
 * - **Grants for the class itself.** `GrantItem` whose predicate is about the class
 *   (`["class:oracle"]`, `{ or: ["class:druid", "feat:order-explorer:..."] }`): a
 *   Druid order grants its feat to a Druid. Our grants have no predicate, so one
 *   that holds for the feature's own class becomes a plain grant.
 *
 * "Holds on the class's own path" is `holdsForOwnClass`: every term must hold, a
 * `class:<x>` term holds for the feature's own classes, an `or` holds if any of
 * its terms does, and a `not` of a feat or of the feature's granter (`not
 * feat:order-explorer:animal-order`, `not parent:granter:slug:crossblooded-evolution`)
 * holds, since those name a different route to the same feature (a feat taken
 * later, another feature granting it). Anything else is not read, and the element
 * stays inert. Checked against the pinned data (2026-10-17): the predicates on the
 * core books' skill training and class grants are all of these shapes.
 */

import { PROFICIENCY_RANKS, type ProficiencyRank } from '../content/common.js';
import { asRecord } from './upstreamHelpers.js';

const SKILL_RANK_PATH = /^system\.skills\.([a-z][a-z-]*)\.rank$/;

/** Whether `term` holds for a character who has the feature through `ownClasses`. */
function termHolds(term: unknown, ownClasses: readonly string[]): boolean {
  if (typeof term === 'string') {
    return term.startsWith('class:') && ownClasses.includes(term.slice('class:'.length));
  }
  const record = asRecord(term);
  if (record === undefined) {
    return false;
  }
  if (Array.isArray(record.or)) {
    return record.or.some((t) => termHolds(t, ownClasses));
  }
  if (typeof record.not === 'string') {
    return record.not.startsWith('feat:') || record.not.startsWith('parent:granter:');
  }
  return false;
}

/** Whether `predicate` (absent, or a list of terms) holds on the feature's own class's path. */
export function holdsForOwnClass(
  predicate: unknown,
  ownClasses: readonly string[],
): boolean {
  if (predicate === undefined) {
    return true;
  }
  return Array.isArray(predicate) && predicate.every((t) => termHolds(t, ownClasses));
}

export interface ClassFeatureRules {
  /** The rules left for the ordinary element mapper, with own-class grant predicates removed. */
  readonly rules: unknown;
  /** Skills the feature trains (or raises), by skill slug. */
  readonly skillRankUps: Readonly<Record<string, ProficiencyRank>>;
}

/** `rules` split into skill training and the rest, read for a feature of `ownClasses`. */
export function readClassFeatureRules(
  rules: unknown,
  ownClasses: readonly string[],
): ClassFeatureRules {
  if (!Array.isArray(rules)) {
    return { rules, skillRankUps: {} };
  }
  const skillRankUps: Record<string, ProficiencyRank> = {};
  const rest: unknown[] = [];
  for (const raw of rules) {
    const record = asRecord(raw);
    const path =
      typeof record?.path === 'string' ? SKILL_RANK_PATH.exec(record.path) : null;
    const rank =
      typeof record?.value === 'number' && Number.isInteger(record.value)
        ? PROFICIENCY_RANKS[record.value]
        : undefined;
    if (
      record?.key === 'ActiveEffectLike' &&
      record.mode === 'upgrade' &&
      path !== null &&
      rank !== undefined &&
      rank !== 'untrained' &&
      holdsForOwnClass(record.predicate, ownClasses)
    ) {
      skillRankUps[path[1] as string] = rank;
      continue;
    }
    if (
      record?.key === 'GrantItem' &&
      record.predicate !== undefined &&
      holdsForOwnClass(record.predicate, ownClasses)
    ) {
      const { predicate: _holds, ...grant } = record;
      rest.push(grant);
      continue;
    }
    rest.push(raw);
  }
  return { rules: rest, skillRankUps };
}
