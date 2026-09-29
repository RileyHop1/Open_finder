/**
 * The dependency-resolution pass (ADR 0003 decision 5): turns every
 * mapper's `UnresolvedGrantItem` into `@hearthtable/core`'s real
 * `GrantItemElement`, using the full set of entries that survived the
 * license and scope filters -- exactly the "full imported entry set" a
 * single-entry mapper (`elementMapper.ts`) doesn't have.
 *
 * **If a grant target isn't in the kept set, the whole granting entry is
 * dropped**, per ADR 0003 decision 5 -- silently stripping the reference
 * would change what the entry does, which is a rules bug, not a missing
 * one. The same rule applies to the other two structural cross-entry
 * references this importer produces: a `heritage`'s `ancestrySlug` and a
 * `classFeature`'s `classSlug`.
 *
 * **Dropping cascades, so this runs to a fixed point.** Dropping an entry
 * can orphan another entry that granted *it* -- an A-grants-B-grants-C
 * chain where C was excluded from the start drops B in round 1 (its grant
 * target is gone) and A in round 2 (its grant target, B, is now gone too).
 * The pass stops once a full round drops nothing.
 *
 * **Deliberately not attempted:** resolving `@UUID[Compendium...]` links
 * embedded in prose `description` fields, and matching free-text
 * `prerequisites` strings against excluded content by name. Both would mean
 * parsing or fuzzy-matching HTML/prose well enough to trust a drop decision
 * on it -- the same risk `mapSpell.ts` already declined for heightening.
 * Guessing wrong here is worse than doing nothing: either an orphaned
 * reference ships anyway (defeating the pass) or content is dropped for no
 * real reason. Revisit if a real-data survey shows it matters.
 */

import type { GrantItemElement, RuleElement } from '@hearthtable/core';

import type { Pf2eEntry } from '../content/entry.js';
import { deterministicId } from './deterministicId.js';
import type { DraftPf2eEntry } from './draftEntry.js';
import type { MappedElement } from './elementMapper.js';

export interface DependencyDrop {
  readonly id: string;
  readonly slug: string;
  readonly kind: string;
  readonly reason: string;
  readonly round: number;
}

export interface ResolveDependenciesResult {
  readonly kept: readonly Pf2eEntry[];
  readonly drops: readonly DependencyDrop[];
}

/**
 * The upstream `_id` a `Compendium....Item.<id>`-shaped uuid names -- the
 * same value `deterministicId` was originally derived from when that
 * target's own id was computed, so re-deriving it here always agrees with
 * the target's real id without any lookup table in between.
 */
function extractUpstreamId(uuid: string): string | undefined {
  const lastDot = uuid.lastIndexOf('.');
  if (lastDot === -1 || lastDot === uuid.length - 1) {
    return undefined;
  }
  return uuid.slice(lastDot + 1);
}

function findGrantTarget(
  uuid: string,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
): DraftPf2eEntry | undefined {
  const upstreamId = extractUpstreamId(uuid);
  return upstreamId === undefined ? undefined : kept.get(deterministicId(upstreamId));
}

/** `undefined` means every reference `entry` makes resolves within `kept`. */
function findBrokenDependency(
  entry: DraftPf2eEntry,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
): string | undefined {
  for (const element of entry.ruleElements) {
    if (
      element.kind === 'unresolvedGrantItem' &&
      findGrantTarget(element.uuid, kept) === undefined
    ) {
      return 'grant-target-excluded';
    }
  }

  if (entry.kind === 'heritage' && entry.ancestrySlug !== undefined) {
    const hasAncestry = [...kept.values()].some(
      (candidate) =>
        candidate.kind === 'ancestry' && candidate.slug === entry.ancestrySlug,
    );
    if (!hasAncestry) {
      return 'ancestry-excluded';
    }
  }

  if (entry.kind === 'classFeature') {
    const hasClass = [...kept.values()].some(
      (candidate) => candidate.kind === 'class' && candidate.slug === entry.classSlug,
    );
    if (!hasClass) {
      return 'class-excluded';
    }
  }

  return undefined;
}

/**
 * By the time this runs, `findBrokenDependency` has already guaranteed
 * every surviving entry's grant targets resolve within `kept` -- so
 * `findGrantTarget` here can never come back `undefined` for a kept entry.
 */
function resolveElement(
  element: MappedElement,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
): RuleElement {
  if (element.kind !== 'unresolvedGrantItem') {
    return element;
  }
  const target = findGrantTarget(element.uuid, kept) as DraftPf2eEntry;
  const resolved: GrantItemElement = {
    kind: 'grantItem',
    packId: target.packId,
    slug: target.slug,
  };
  return resolved;
}

/**
 * Every `DraftEntry<T>` in `DraftPf2eEntry` is `T` with only `ruleElements`
 * swapped to `readonly MappedElement[]` (see `draftEntry.ts`); replacing
 * that one field with the fully-resolved `RuleElement[]` reproduces the
 * original `T` exactly.
 */
function resolveEntry(
  entry: DraftPf2eEntry,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
): Pf2eEntry {
  const ruleElements = entry.ruleElements.map((element) => resolveElement(element, kept));
  return { ...entry, ruleElements };
}

export function resolveDependencies(
  entries: readonly DraftPf2eEntry[],
): ResolveDependenciesResult {
  const kept = new Map(entries.map((entry) => [entry.id, entry] as const));
  const drops: DependencyDrop[] = [];

  let round = 0;
  let droppedThisRound = true;
  while (droppedThisRound) {
    round++;
    droppedThisRound = false;
    for (const entry of [...kept.values()]) {
      const reason = findBrokenDependency(entry, kept);
      if (reason !== undefined) {
        kept.delete(entry.id);
        drops.push({ id: entry.id, slug: entry.slug, kind: entry.kind, reason, round });
        droppedThisRound = true;
      }
    }
  }

  return {
    kept: [...kept.values()].map((entry) => resolveEntry(entry, kept)),
    drops,
  };
}
