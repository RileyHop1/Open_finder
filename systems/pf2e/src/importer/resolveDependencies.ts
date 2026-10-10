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
 * `classFeature`'s `classSlugs` (at least one must be kept).
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

import type { ChoiceSetElement, GrantItemElement, RuleElement } from '@hearthtable/core';

import type { Pf2eEntry } from '../content/entry.js';
import type { DraftPf2eEntry } from './draftEntry.js';
import type { MappedElement, UnresolvedTagChoice } from './elementMapper.js';
import { buildUuidResolver, type UuidTargetResolver } from './upstreamUuid.js';

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
 * The kept entry a grant uuid names. Resolved against *every* draft, not just
 * the survivors, so a name that is ambiguous stays ambiguous after one of the
 * candidates is dropped; the target must then still be in `kept`.
 */
function findGrantTarget(
  uuid: string,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
  resolveTarget: UuidTargetResolver<DraftPf2eEntry>,
): DraftPf2eEntry | undefined {
  const target = resolveTarget(uuid);
  return target === undefined ? undefined : kept.get(target.id);
}

/** `undefined` means every reference `entry` makes resolves within `kept`. */
function findBrokenDependency(
  entry: DraftPf2eEntry,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
  resolveTarget: UuidTargetResolver<DraftPf2eEntry>,
): string | undefined {
  for (const element of entry.ruleElements) {
    if (
      element.kind === 'unresolvedGrantItem' &&
      findGrantTarget(element.uuid, kept, resolveTarget) === undefined
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
      (candidate) =>
        candidate.kind === 'class' && entry.classSlugs.includes(candidate.slug),
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
  owner: DraftPf2eEntry,
  resolveTarget: UuidTargetResolver<DraftPf2eEntry>,
): RuleElement | undefined {
  if (element.kind === 'unresolvedTagChoice') {
    return resolveTagChoice(element, kept, owner);
  }
  if (element.kind === 'unresolvedChosenGrant') {
    // The grant half of a tag choice is folded into the choice (`grantsFromPackId`).
    // One with no choice to fold into has nothing to grant.
    return hasTagChoice(owner, element.flag)
      ? undefined
      : {
          kind: 'inert',
          upstreamKind: 'GrantItem',
          reason: 'chosen-grant-without-choice',
        };
  }
  if (element.kind !== 'unresolvedGrantItem') {
    return element;
  }
  const target = findGrantTarget(element.uuid, kept, resolveTarget) as DraftPf2eEntry;
  const resolved: GrantItemElement = {
    kind: 'grantItem',
    packId: target.packId,
    slug: target.slug,
  };
  return resolved;
}

function hasTagChoice(owner: DraftPf2eEntry, flag: string): boolean {
  return owner.ruleElements.some(
    (e) => e.kind === 'unresolvedTagChoice' && e.flag === flag,
  );
}

/**
 * "Pick one of the features carrying this tag": the options are the kept
 * class features with that tag, and the pick is granted. With no such feature
 * kept there is nothing to pick, so the choice goes inert (visible in the
 * coverage report) instead of offering an empty list.
 */
function resolveTagChoice(
  element: UnresolvedTagChoice,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
  owner: DraftPf2eEntry,
): RuleElement {
  const choices = [...kept.values()]
    .filter((c) => c.kind === 'classFeature' && c.tags.includes(element.tag))
    .map((c) => ({ label: c.name, value: c.slug }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (choices.length === 0) {
    return { kind: 'inert', upstreamKind: 'ChoiceSet', reason: 'no-features-for-tag' };
  }
  const grants = owner.ruleElements.some(
    (e) => e.kind === 'unresolvedChosenGrant' && e.flag === element.flag,
  );
  const resolved: ChoiceSetElement = {
    kind: 'choiceSet',
    prompt: `Choose ${owner.name}`,
    choices,
    rollOptionPrefix: element.rollOptionPrefix,
    ...(grants ? { grantsFromPackId: 'classFeatures' } : {}),
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
  resolveTarget: UuidTargetResolver<DraftPf2eEntry>,
): Pf2eEntry {
  const ruleElements = entry.ruleElements.flatMap((element) => {
    const resolved = resolveElement(element, kept, entry, resolveTarget);
    return resolved === undefined ? [] : [resolved];
  });
  if (entry.kind === 'classFeature') {
    // Only the classes that were kept: the rest of the feature's traits are not classes.
    const keptClasses = new Set(
      [...kept.values()].filter((c) => c.kind === 'class').map((c) => c.slug),
    );
    return {
      ...entry,
      ruleElements,
      classSlugs: entry.classSlugs.filter((slug) => keptClasses.has(slug)),
    };
  }
  return { ...entry, ruleElements };
}

/**
 * A scroll or wand's `consumable.spell` is a weaker reference than
 * `GrantItem`: unlike that or `heritage.ancestrySlug`/`classFeature.classSlugs`,
 * losing it doesn't change what the item mechanically does to anything
 * this project automates, only what its tooltip can link to. So ADR 0021
 * has it fail softer than the others -- the reference is dropped, not the
 * whole consumable (CLAUDE.md's "excluded content is excluded whole"
 * still applies to the *reference itself*, just not to the item carrying
 * it). Runs after the fixed-point loop above, against the final `kept`
 * set, since a spell referenced by a gear entry can itself be dropped in
 * any round.
 */
function clearUnresolvedConsumableSpell(
  entry: Pf2eEntry,
  kept: ReadonlyMap<string, DraftPf2eEntry>,
): Pf2eEntry {
  if (entry.kind !== 'gear' || entry.consumable?.spell === undefined) {
    return entry;
  }
  const { packId, slug } = entry.consumable.spell;
  const spellExists = [...kept.values()].some(
    (candidate) =>
      candidate.kind === 'spell' &&
      candidate.packId === packId &&
      candidate.slug === slug,
  );
  if (spellExists) {
    return entry;
  }
  const { spell: _spell, ...consumableWithoutSpell } = entry.consumable;
  return { ...entry, consumable: consumableWithoutSpell };
}

export function resolveDependencies(
  entries: readonly DraftPf2eEntry[],
  /** Entry id to the upstream folder it was read from; see `upstreamUuid.ts`. */
  folderById: ReadonlyMap<string, string> = new Map(),
): ResolveDependenciesResult {
  const kept = new Map(entries.map((entry) => [entry.id, entry] as const));
  const resolveTarget = buildUuidResolver(entries, (entry) => folderById.get(entry.id));
  const drops: DependencyDrop[] = [];

  let round = 0;
  let droppedThisRound = true;
  while (droppedThisRound) {
    round++;
    droppedThisRound = false;
    for (const entry of [...kept.values()]) {
      const reason = findBrokenDependency(entry, kept, resolveTarget);
      if (reason !== undefined) {
        kept.delete(entry.id);
        drops.push({ id: entry.id, slug: entry.slug, kind: entry.kind, reason, round });
        droppedThisRound = true;
      }
    }
  }

  return {
    kept: [...kept.values()]
      .map((entry) => resolveEntry(entry, kept, resolveTarget))
      .map((entry) => clearUnresolvedConsumableSpell(entry, kept)),
    drops,
  };
}
