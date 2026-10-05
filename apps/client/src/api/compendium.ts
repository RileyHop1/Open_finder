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
import { z } from 'zod';

export const entrySummarySchema = z.object({
  packId: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  traits: z.array(z.string()),
});

export type EntrySummary = z.infer<typeof entrySummarySchema>;

const statusSchema = z.object({ available: z.boolean(), entryCount: z.number() });

export interface SearchParams {
  q?: string;
  kind?: string;
  limit?: number;
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
