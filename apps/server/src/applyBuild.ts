/**
 * `actor.applyBuild` (ADR 0024, `docs/character-build.md`): applies a
 * character's build choices in one step. The client sends only the build; the
 * server validates it, looks every entry up in its own compendium, runs the
 * pure `deriveCharacter`, and writes the derived values and items through
 * `editCharacter` (so ownership, validation and storage are the same path
 * every other sheet edit takes).
 *
 * Nothing here enforces a rule (ADR 0023). A rules problem is a warning the
 * client already showed from the same derivation; the only rejections are
 * data problems: a build that does not parse, or an ancestry, heritage,
 * background or class the compendium does not have.
 *
 * Re-applying is safe. Feats, features, actions and spells the build derives
 * are added only if the character does not already have that entry, and
 * nothing is ever removed, so a hand-added item survives. `keep` names value
 * paths whose current values are put back after the derived ones are written
 * (the hand-edited numbers a level-up chose to keep).
 */

import type { Actor, Seat } from '@hearthtable/core';
import type { CharacterData, CharacterItem } from '@hearthtable/pf2e';
import {
  ATTRIBUTES,
  ancestryEntrySchema,
  backgroundEntrySchema,
  characterBuildSchema,
  characterItemEntrySchema,
  classEntrySchema,
  classFeatureEntrySchema,
  deriveCharacter,
  heritageEntrySchema,
  prepareCharacter,
} from '@hearthtable/pf2e';
import type { z } from 'zod';

import { editCharacter } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

type BuildRef = { packId: string; slug: string };

/** The compendium entry for `ref`, parsed with `schema`, or a rejection saying what was missing. */
function requireEntry<T>(
  compendium: CompendiumIndex,
  ref: BuildRef | undefined,
  schema: z.ZodType<T>,
  what: string,
): T | undefined {
  if (ref === undefined) {
    return undefined;
  }
  const found = compendium.get(ref.packId, ref.slug);
  const parsed = found === undefined ? undefined : schema.safeParse(found);
  if (parsed === undefined || !parsed.success) {
    throw new OperationRejected(
      `no ${what} ${ref.packId}/${ref.slug} in the compendium` +
        (compendium.status().available ? '' : ' (no content has been imported)'),
    );
  }
  return parsed.data;
}

const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function pathOf(path: string): string[] {
  const segments = path.split('.');
  if (segments.some((s) => UNSAFE_SEGMENTS.has(s))) {
    throw new OperationRejected(`cannot keep ${path}`);
  }
  return segments;
}

function readPath(root: unknown, segments: readonly string[]): unknown {
  let node = root;
  for (const segment of segments) {
    if (typeof node !== 'object' || node === null || !(segment in node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** Sets `value` at `segments` in `root`, creating objects on the way; `undefined` deletes. */
function writePath(
  root: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
) {
  let node = root;
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment];
    if (typeof next !== 'object' || next === null) {
      node[segment] = {};
    }
    node = node[segment] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (last === undefined) {
    return;
  }
  if (value === undefined) {
    delete node[last];
  } else {
    node[last] = value;
  }
}

/** Whether `items` already holds an item copied from `packId/slug`. */
function hasSource(
  items: readonly CharacterItem[],
  packId: string,
  slug: string,
): boolean {
  return items.some(
    (i) =>
      (i.source?.packId === packId && i.source.slug === slug) ||
      (i.entry.packId === packId && i.entry.slug === slug),
  );
}

export function applyBuild(
  store: WorldStore,
  seat: Seat,
  compendium: CompendiumIndex,
  payload: {
    actorId: string;
    build: Record<string, unknown>;
    level?: number | undefined;
    keyAttribute?: string | undefined;
    keep?: readonly string[] | undefined;
  },
): Actor {
  const build = characterBuildSchema.safeParse(payload.build);
  if (!build.success) {
    throw new OperationRejected(
      `invalid build: ${build.error.issues[0]?.path.join('.') ?? ''} ${build.error.issues[0]?.message ?? ''}`.trim(),
    );
  }
  const keyAttribute = payload.keyAttribute;
  if (
    keyAttribute !== undefined &&
    !(ATTRIBUTES as readonly string[]).includes(keyAttribute)
  ) {
    throw new OperationRejected(`${keyAttribute} is not an attribute`);
  }
  const keepPaths = (payload.keep ?? []).map(pathOf);

  const ancestry = requireEntry(
    compendium,
    build.data.ancestry,
    ancestryEntrySchema,
    'ancestry',
  );
  const heritage = requireEntry(
    compendium,
    build.data.heritage,
    heritageEntrySchema,
    'heritage',
  );
  const background = requireEntry(
    compendium,
    build.data.background,
    backgroundEntrySchema,
    'background',
  );
  const cls = requireEntry(compendium, build.data.class, classEntrySchema, 'class');

  const classFeatures =
    cls === undefined
      ? []
      : compendium
          .search({ kind: 'classFeature', classSlug: cls.slug, limit: 200 })
          .flatMap((summary) => {
            const parsed = classFeatureEntrySchema.safeParse(
              compendium.get(summary.packId, summary.slug),
            );
            return parsed.success ? [parsed.data] : [];
          });

  return editCharacter(store, seat, payload.actorId, (before) => {
    const level = payload.level ?? before.level;
    const derived = deriveCharacter({
      build: build.data,
      level,
      keyAttribute:
        (keyAttribute as CharacterData['keyAttribute'] | undefined) ??
        before.keyAttribute,
      ancestry,
      heritage,
      background,
      class: cls,
      classFeatures,
      resolve: (packId, slug) => {
        const found = compendium.get(packId, slug);
        const carriable =
          found === undefined ? undefined : characterItemEntrySchema.safeParse(found);
        return carriable?.success ? carriable.data : undefined;
      },
    });

    const ref = (entry: { name: string; packId: string; slug: string } | undefined) =>
      entry === undefined
        ? undefined
        : { name: entry.name, source: { packId: entry.packId, slug: entry.slug } };

    const newItems: CharacterItem[] = [];
    for (const entry of derived.items) {
      if (!hasSource([...before.items, ...newItems], entry.packId, entry.slug)) {
        newItems.push({
          id: crypto.randomUUID(),
          source: { packId: entry.packId, slug: entry.slug },
          entry,
          equipped: false,
          quantity: 1,
        });
      }
    }

    const next: CharacterData = {
      ...before,
      level,
      attributes: { ...derived.attributes },
      keyAttribute: derived.keyAttribute,
      ranks: derived.ranks,
      ancestryHp: derived.ancestryHp,
      classHp: derived.classHp,
      speed: derived.speed,
      items: [...before.items, ...newItems],
      build: build.data,
      ...(ref(ancestry) === undefined ? {} : { ancestry: ref(ancestry) }),
      ...(ref(heritage) === undefined ? {} : { heritage: ref(heritage) }),
      ...(ref(background) === undefined ? {} : { background: ref(background) }),
      ...(ref(cls) === undefined ? {} : { class: ref(cls) }),
    };

    // Put the hand-edited values the caller chose to keep back.
    const kept = structuredClone(next) as unknown as Record<string, unknown>;
    for (const segments of keepPaths) {
      writePath(kept, segments, readPath(before, segments));
    }
    const result = kept as unknown as CharacterData;

    // A fresh or full-health character starts the new build at full health.
    const oldMax = prepareCharacter(before).hp.max.total;
    const newMax = prepareCharacter(result).hp.max.total;
    const wasFull = oldMax <= 0 || before.hp.current >= oldMax;
    return wasFull
      ? { ...result, hp: { ...result.hp, current: Math.max(0, newMax) } }
      : result;
  });
}
