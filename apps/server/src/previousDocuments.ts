/**
 * Remembers what each document looked like *before* an operation changed it.
 *
 * `broadcastFor` (`visibility.ts`) needs it to take access away. A broadcast
 * carries a changed document's new state, and a viewer who can no longer read
 * that state (the GM hid a token, the party left a scene) must be told to drop
 * the copy they hold. But sending that notice for every unreadable change would
 * announce a hidden NPC to every player each time the GM edits it, so the notice
 * goes only to a viewer who could read the *previous* state, i.e. one who
 * actually has it (ADR 0017, decision 3).
 *
 * It is captured at the store boundary rather than asked of each handler, so a
 * handler that changes who may see a document cannot forget to say so: any
 * `putDocument` records the document's prior state, whatever called it.
 */

import type { BaseDocument } from '@hearthtable/core';
import { baseDocumentSchema } from '@hearthtable/core';

import type { WorldStore } from './worldStore.js';

/**
 * A `WorldStore` that behaves exactly like `store` and also records, in
 * `previous`, the stored state of every document before its **first** write in
 * this operation. A document the operation creates has no entry. Only the
 * envelope is kept: permissions are all `broadcastFor` reads.
 */
export function recordPreviousDocuments(
  store: WorldStore,
  previous: Map<string, BaseDocument>,
): WorldStore {
  /** Ids already written in this operation, so a second write never mistakes the first for the original. */
  const written = new Set<string>();
  return {
    ...store,
    putDocument(document: BaseDocument): void {
      if (!written.has(document.id)) {
        written.add(document.id);
        const before = baseDocumentSchema.safeParse(store.getDocument(document.id));
        if (before.success) {
          previous.set(document.id, before.data);
        }
      }
      store.putDocument(document);
    },
  };
}
