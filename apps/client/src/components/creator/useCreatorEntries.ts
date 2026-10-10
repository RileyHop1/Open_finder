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
  heritageEntrySchema,
  type AncestryEntry,
  type BuildRef,
  type CharacterBuild,
  type HeritageEntry,
} from '@hearthtable/pf2e';
import { shallowReactive, watch } from 'vue';
import type { z } from 'zod';

import { getPf2eEntry } from '../../api/compendium.js';

export interface CreatorEntries {
  ancestry?: AncestryEntry | undefined;
  heritage?: HeritageEntry | undefined;
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

/** Entries for the build's ancestry and heritage, reloaded whenever those references change. */
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
  return entries;
}
