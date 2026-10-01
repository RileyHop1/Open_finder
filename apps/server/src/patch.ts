/**
 * Applies a dotted-path change set to a plain JSON object. The only code that
 * turns a client-supplied string like `system.ranks.skills.athletics` into a
 * write, so it is deliberately small and strict:
 *
 * - A path is dot-separated segments of letters, digits, `_` and `-` (skill
 *   slugs like `academia-lore` are valid; nothing else is). `__proto__`,
 *   `constructor`, and `prototype` are refused outright.
 * - Missing objects along a set path are created. A path that runs *through*
 *   something that is not a plain object -- an array, a number -- is refused:
 *   arrays are changed by their own operations, never by index.
 * - A `null` value removes the field. Removing a field whose parent does not
 *   exist is a no-op, not an error.
 *
 * It mutates `target`, so callers pass a clone. What may be changed at all
 * (which paths) and whether the result is valid are the caller's business.
 */

import { OperationRejected } from './rejection.js';

const SEGMENT = /^[A-Za-z0-9_-]+$/;
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/** The segments of `path`, or throws `OperationRejected` if it is malformed. */
export function parsePath(path: string): string[] {
  const segments = path.split('.');
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || FORBIDDEN_SEGMENTS.has(segment)) {
      throw new OperationRejected(`invalid field path: ${path}`);
    }
  }
  return segments;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sets (or, for `null`, removes) the field at `segments` in `target`. */
function applyOne(
  target: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
  path: string,
): void {
  let node = target;
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment];
    if (next === undefined) {
      if (value === null) {
        return;
      }
      const created: Record<string, unknown> = {};
      node[segment] = created;
      node = created;
    } else if (isPlainObject(next)) {
      node = next;
    } else {
      throw new OperationRejected(`cannot change ${path}: ${segment} is not an object`);
    }
  }
  const leaf = segments[segments.length - 1];
  if (leaf === undefined) {
    throw new OperationRejected(`invalid field path: ${path}`);
  }
  if (value === null) {
    // `delete` is the point here: a removed optional field must be absent, not null.
    delete node[leaf];
  } else {
    node[leaf] = value;
  }
}

/** Applies every entry of `changes` to `target`, in order. */
export function applyChanges(
  target: Record<string, unknown>,
  changes: Readonly<Record<string, unknown>>,
): void {
  for (const [path, value] of Object.entries(changes)) {
    applyOne(target, parsePath(path), value, path);
  }
}
