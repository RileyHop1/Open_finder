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

import type { CompendiumEntry } from '@hearthtable/core';
import { defineStore } from 'pinia';

import { getCompendiumEntry } from '../api/compendium.js';

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
   * term, or a trait with no glossary entry yet -- not a failure; a
   * genuine network failure rejects instead, for the caller to handle.
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

  return { getEntry };
});
