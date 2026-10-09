/**
 * The client's view of `apps/server`'s read-only compendium routes
 * (ADR 0015). Public reference data, so no device token. Search returns
 * summaries only; the server makes the actual copy onto a character when an
 * item is added. `getCompendiumEntry` is the exception: milestone 6's
 * tooltips (`stores/rules.ts`) need an entry's full `text` to render,
 * which a summary doesn't carry.
 */

import {
  compendiumEntrySchema,
  traitEntrySchema,
  type CompendiumEntry,
  type TraitEntry,
} from '@hearthtable/core';
import { pf2eEntrySchema, type Pf2eEntry } from '@hearthtable/pf2e';
import { z } from 'zod';

export const entrySummarySchema = z.object({
  packId: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  traits: z.array(z.string()),
  level: z.number().optional(),
  category: z.string().optional(),
  classSlug: z.string().optional(),
  ancestrySlug: z.string().optional(),
});

export type EntrySummary = z.infer<typeof entrySummarySchema>;

const statusSchema = z.object({ available: z.boolean(), entryCount: z.number() });

export interface SearchParams {
  q?: string;
  kind?: string;
  limit?: number;
  /** Exactly this level (feats and class features). */
  level?: number;
  /** At or below this level (feats and class features). */
  maxLevel?: number;
  /** Feats of this category. */
  category?: string;
  /** Entries carrying this trait. */
  trait?: string;
  /** Class features granted by this class. */
  classSlug?: string;
  /** Heritages of this ancestry. */
  ancestrySlug?: string;
}

async function getJson<T>(url: string, schema: z.ZodType<T>, action: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to ${action}: server responded ${response.status}`);
  }
  const body: unknown = await response.json();
  return schema.parse(body);
}

/** Whether any content has been imported at all. */
export async function isCompendiumAvailable(): Promise<boolean> {
  const status = await getJson('/api/compendium', statusSchema, 'check the compendium');
  return status.available;
}

/** Entries whose name matches `q`, optionally of one `kind`, best matches first. */
export function searchCompendium(params: SearchParams = {}): Promise<EntrySummary[]> {
  const query = new URLSearchParams();
  if (params.q !== undefined && params.q !== '') {
    query.set('q', params.q);
  }
  if (params.kind !== undefined && params.kind !== '') {
    query.set('kind', params.kind);
  }
  if (params.limit !== undefined) {
    query.set('limit', String(params.limit));
  }
  for (const key of ['level', 'maxLevel'] as const) {
    const value = params[key];
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  for (const key of ['category', 'trait', 'classSlug', 'ancestrySlug'] as const) {
    const value = params[key];
    if (value !== undefined && value !== '') {
      query.set(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return getJson(
    `/api/compendium/search${suffix}`,
    z.array(entrySummarySchema),
    'search the compendium',
  );
}

/** The full entry, or `undefined` if `packId`/`slug` names none -- a 404 is an expected outcome here (a stale link, a trait with no glossary entry yet), not a failure worth throwing over. */
export async function getCompendiumEntry(
  packId: string,
  slug: string,
): Promise<CompendiumEntry | undefined> {
  const response = await fetch(
    `/api/compendium/${encodeURIComponent(packId)}/${encodeURIComponent(slug)}`,
  );
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(
      `failed to fetch compendium entry: server responded ${response.status}`,
    );
  }
  const body: unknown = await response.json();
  return compendiumEntrySchema.parse(body);
}

/**
 * The full entry with its PF2e fields intact (a class's proficiencies, a
 * feat's category and prerequisites, an ancestry's boosts), for the character
 * wizard. `getCompendiumEntry` above parses against the system-agnostic
 * envelope and so strips them. `undefined` for a 404, like that one.
 */
export async function getPf2eEntry(
  packId: string,
  slug: string,
): Promise<Pf2eEntry | undefined> {
  const response = await fetch(
    `/api/compendium/${encodeURIComponent(packId)}/${encodeURIComponent(slug)}`,
  );
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(
      `failed to fetch compendium entry: server responded ${response.status}`,
    );
  }
  const body: unknown = await response.json();
  return pf2eEntrySchema.parse(body);
}

/**
 * The whole trait glossary (ADR 0020 decision 5), fetched once -- it's one
 * short flat list (208 entries against a real import), not a per-slug
 * lookup like `getCompendiumEntry`, because `traits.json` isn't a pack.
 * `stores/rules.ts` is where this gets cached and turned into a per-slug
 * lookup for `RulesTerm`.
 */
export function getCompendiumTraits(): Promise<TraitEntry[]> {
  return getJson(
    '/api/compendium/traits',
    z.array(traitEntrySchema),
    'fetch the trait glossary',
  );
}
