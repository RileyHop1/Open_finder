/**
 * The write-permission check every operation that changes an existing
 * document goes through (`actor.delete` now; `actor.update`, item and
 * condition operations next). Before milestone 3 the only check was "has this
 * connection claimed a seat".
 *
 * Two deliberate behaviors:
 * - A document the seat cannot read is reported as **not found**, the same
 *   message as a missing one, so a rejection never confirms that a hidden
 *   document exists.
 * - Changing a document needs `owner`. The GM always resolves to `owner`
 *   (`resolvePermission`), so the GM can change anything.
 */

import type { BaseDocument, Seat } from '@hearthtable/core';
import {
  baseDocumentSchema,
  canReadDocument,
  resolvePermission,
} from '@hearthtable/core';

import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

export interface OwnedDocument {
  /** The shared envelope, with any type-specific fields passed through. */
  readonly envelope: BaseDocument;
  /** The stored body, exactly as read. */
  readonly raw: unknown;
}

/**
 * Loads the document `id` for `seat` to change. Throws `OperationRejected` if
 * it does not exist, is not a `type` document, cannot be read by `seat`, or
 * is not owned by `seat`. `label` names the kind in messages ("actor").
 */
export function loadOwnedDocument(
  store: WorldStore,
  seat: Seat,
  id: string,
  type: string,
  label: string,
): OwnedDocument {
  const raw = store.getDocument(id);
  const parsed = baseDocumentSchema.loose().safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.type !== type ||
    !canReadDocument(seat, parsed.data)
  ) {
    throw new OperationRejected(`no ${label} found with id ${id}`);
  }
  if (resolvePermission(seat, parsed.data) !== 'owner') {
    throw new OperationRejected(`you do not have permission to change this ${label}`);
  }
  return { envelope: parsed.data, raw };
}
