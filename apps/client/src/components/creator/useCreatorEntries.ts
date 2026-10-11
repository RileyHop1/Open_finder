/**
 * Keeps the compendium entries a draft's references point at loaded, so the
 * steps can show their details and the preview can derive from them. A
 * reference changes when the player picks something and when a saved draft
 * is reopened, so this watches the build rather than being told. A reference
 * whose entry cannot be fetched (not imported, or since removed) simply has no
 * entry: the choice stays in the draft and the preview ignores it.
 */

import {
  ancestryEntrySchema,
  backgroundEntrySchema,
  classEntrySchema,
  classFeatureEntrySchema,
  type ClassFeatureEntry,
  heritageEntrySchema,
  type AncestryEntry,
  type BackgroundEntry,
  type ClassEntry,
  type BuildRef,
  type CharacterBuild,
  type HeritageEntry,
} from '@hearthtable/pf2e';
import { shallowReactive, watch } from 'vue';
import type { z } from 'zod';

import { getPf2eEntry, searchCompendium } from '../../api/compendium.js';

export interface CreatorEntries {
  ancestry?: AncestryEntry | undefined;
  heritage?: HeritageEntry | undefined;
  background?: BackgroundEntry | undefined;
  class?: ClassEntry | undefined;
  /** The class's features due at level 1, and the alternatives its choices offer. */
  classFeatures?: ClassFeatureEntry[] | undefined;
}

/** The entry for `ref` if it exists and is the expected kind, else `undefined`. Never throws. */
async function fetchEntry<T>(
  ref: BuildRef | undefined,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  if (ref === undefined) {
    return undefined;
  }
  try {
    const entry = await getPf2eEntry(ref.packId, ref.slug);
    const parsed = entry === undefined ? undefined : schema.safeParse(entry);
    return parsed?.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** The class's level 1 features, fetched in full. Never throws; a feature that cannot be fetched is left out. */
async function fetchClassFeatures(
  ref: BuildRef | undefined,
): Promise<ClassFeatureEntry[]> {
  if (ref === undefined) {
    return [];
  }
  try {
    const summaries = await searchCompendium({
      kind: 'classFeature',
      classSlug: ref.slug,
      maxLevel: 1,
      limit: 200,
    });
    const found = await Promise.all(
      summaries.map((s) =>
        fetchEntry({ packId: s.packId, slug: s.slug }, classFeatureEntrySchema),
      ),
    );
    return found.flatMap((f) => (f === undefined ? [] : [f]));
  } catch {
    return [];
  }
}

/** Entries for the build's ancestry, heritage, background and class, reloaded whenever those references change. */
export function useCreatorEntries(build: () => CharacterBuild): CreatorEntries {
  const entries = shallowReactive<CreatorEntries>({});

  function track<K extends keyof CreatorEntries>(
    key: K,
    pick: (b: CharacterBuild) => BuildRef | undefined,
    schema: z.ZodType<NonNullable<CreatorEntries[K]>>,
  ): void {
    watch(
      () => {
        const ref = pick(build());
        return ref === undefined ? '' : `${ref.packId}/${ref.slug}`;
      },
      async () => {
        const ref = pick(build());
        const wanted = ref === undefined ? '' : `${ref.packId}/${ref.slug}`;
        const entry = await fetchEntry(ref, schema);
        // Ignore a slow answer for a reference the player has since moved off.
        const now = pick(build());
        if ((now === undefined ? '' : `${now.packId}/${now.slug}`) === wanted) {
          entries[key] = entry;
        }
      },
      { immediate: true },
    );
  }

  track('ancestry', (b) => b.ancestry, ancestryEntrySchema);
  track('heritage', (b) => b.heritage, heritageEntrySchema);
  track('background', (b) => b.background, backgroundEntrySchema);
  track('class', (b) => b.class, classEntrySchema);

  watch(
    () => build().class?.slug ?? '',
    async () => {
      const ref = build().class;
      const features = await fetchClassFeatures(ref);
      if ((build().class?.slug ?? '') === (ref?.slug ?? '')) {
        entries.classFeatures = features;
      }
    },
    { immediate: true },
  );
  return entries;
}
