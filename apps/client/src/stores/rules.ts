/**
 * A lookup cache for compendium entries, for rules tooltips and the
 * encyclopedia (`docs/rules-reference.md`). A `RulesTerm` names only a
 * `(termKind, slug)`-ish pair (see `packages/core`'s `richTextSchema`), so
 * opening its tooltip means fetching the full entry on demand -- this store
 * is where every term, wherever it's rendered, shares that fetch and its
 * result instead of each repeating it.
 *
 * Cached forever once resolved, never invalidated: a compendium entry is
 * read-only and in-memory for the server's whole run (ADR 0015), so
 * nothing about one can change out from under an open session.
 */

import type { CompendiumEntry, TraitEntry } from '@hearthtable/core';
import { defineStore } from 'pinia';

import { getCompendiumEntry, getCompendiumTraits } from '../api/compendium.js';

export const useRulesStore = defineStore('rules', () => {
  // `undefined` as a *stored* value (checked via `has`) means "already
  // asked, and the server has nothing at this packId/slug" -- distinct
  // from "never asked", which `has` also reports as false.
  const cache = new Map<string, CompendiumEntry | undefined>();
  const pending = new Map<string, Promise<CompendiumEntry | undefined>>();

  function keyOf(packId: string, slug: string): string {
    return `${packId}/${slug}`;
  }

  /**
   * The entry at `(packId, slug)`. Fetched once; every later call for the
   * same pair returns the cached result (or, while the first fetch is
   * still in flight, the same promise) rather than issuing another
   * request. `undefined` means the server has no such entry -- a stale
   * term -- not a failure; a genuine network failure rejects instead, for
   * the caller to handle.
   */
  async function getEntry(
    packId: string,
    slug: string,
  ): Promise<CompendiumEntry | undefined> {
    const key = keyOf(packId, slug);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const inFlight = pending.get(key);
    if (inFlight !== undefined) {
      return inFlight;
    }
    const request = getCompendiumEntry(packId, slug)
      .then((entry) => {
        cache.set(key, entry);
        return entry;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, request);
    return request;
  }

  // The trait glossary (ADR 0020 decision 5) is one flat list, not a pack
  // -- `traits.json` has no per-slug route to call like `getEntry`'s packs
  // do, so the whole thing is fetched once (the first trait tooltip opened
  // anywhere pays for it) and every later lookup is a local `Map.get`.
  let traitsRequest: Promise<ReadonlyMap<string, TraitEntry>> | undefined;

  /**
   * The trait glossary entry for `slug`, or `undefined` if it has none --
   * a trait the heuristic in `traitGlossary.ts` couldn't resolve, shown as
   * a bare name rather than a broken tooltip (ADR 0020 decision 6), not a
   * failure. A genuine network failure rejects, and -- unlike a resolved
   * fetch, which is cached forever -- clears `traitsRequest` first, so the
   * next call retries instead of replaying the same rejection forever.
   */
  async function getTrait(slug: string): Promise<TraitEntry | undefined> {
    traitsRequest ??= getCompendiumTraits()
      .then((entries) => new Map(entries.map((entry) => [entry.slug, entry])))
      .catch((error: unknown) => {
        traitsRequest = undefined;
        throw error;
      });
    const bySlug = await traitsRequest;
    return bySlug.get(slug);
  }

  return { getEntry, getTrait };
});
