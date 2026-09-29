/**
 * Deterministic UUIDs for imported content. `compendiumEntrySchema.id`
 * requires a real UUID (`z.uuid()`), but an entry's identity has to be
 * stable across re-imports of the same upstream commit -- otherwise a
 * rerun is never byte-identical (see the milestone's verification steps),
 * and anything that referenced an entry by id would break on the next
 * import. A fresh `crypto.randomUUID()` per entry would defeat that; this
 * derives the same UUID every time from the same input instead.
 *
 * This is a UUID v5 (name-based, SHA-1) per RFC 4122 -- implemented
 * directly against `node:crypto` rather than adding a dependency for it,
 * since the algorithm is small, fixed, and has no security requirement
 * (this is an identity key, not a secret).
 */

import { createHash } from 'node:crypto';

/**
 * This project's own namespace UUID, generated once and fixed forever --
 * changing it would change every derived id, which would be exactly the
 * re-import instability this module exists to prevent. Never regenerate it.
 */
const HEARTHTABLE_NAMESPACE = 'e21d1a1e-9c1e-4b5a-8b1f-6f6b6a0c9d7e';

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * The UUID v5 algorithm itself, taking the namespace as a parameter -- kept
 * separate from `deterministicId` so it can be verified directly against
 * RFC 4122's own published test vector (`deterministicId.test.ts`) instead
 * of only checked for internal self-consistency. Not exported from the
 * package barrel: every real caller uses `deterministicId`, which fixes the
 * namespace so nothing can accidentally use a different one.
 */
export function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const hash = createHash('sha1').update(namespaceBytes).update(nameBytes).digest();

  const bytes = new Uint8Array(16);
  bytes.set(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant RFC 4122

  return bytesToUuid(bytes);
}

/**
 * Derives a UUID v5 from `name` -- the same `name` always produces the same
 * UUID. Used for an imported entry's own `id`, and for a granted item's
 * reference target: both derive from the same upstream `_id`, so they agree
 * without either side needing to look the other up.
 */
export function deterministicId(name: string): string {
  return uuidV5(HEARTHTABLE_NAMESPACE, name);
}
