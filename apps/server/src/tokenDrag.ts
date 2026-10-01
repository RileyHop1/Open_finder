/**
 * The live drag preview (ADR 0005, decision 6; ADR 0017, decision 5): where a
 * token is while someone drags it, relayed to everyone else who can see it. It
 * is the hot path, so it bypasses the operation pipeline on purpose: nothing is
 * stored, nothing is sequenced, nothing is replayed, and a dropped preview costs
 * one frame of someone else's drag because the settled `token.move` corrects it.
 *
 * Two rules keep it from being a way around the real ones:
 * - **Who may drag is exactly who may move** (`loadMovableToken`), so a player
 *   cannot preview dragging a monster or a token they cannot see.
 * - **Who receives it is who can read the token** (`canReadDocument`), so a hidden
 *   token's drag by the GM reaches no player.
 *
 * Anything refused is dropped without a word: there is no acknowledgement to
 * answer, and a preview is not worth an error.
 */

import type { Seat, TokenDrag } from '@hearthtable/core';
import { tokenDragSchema } from '@hearthtable/core';
import type { Token } from '@hearthtable/core';

import { OperationRejected } from './rejection.js';
import { loadMovableToken } from './tokens.js';
import type { WorldStore } from './worldStore.js';

/** The most previews one connection may send per second. A drag event fires far faster than anyone can see. */
export const DRAG_PREVIEWS_PER_SECOND = 30;

/**
 * A rate limiter for one connection: returns `true` if a preview may go now,
 * `false` if it is too soon after the last one that did. Leading edge, so the
 * first preview of a drag always passes; the one dropped at the end of a drag is
 * made up for by the settled move. `now` is a parameter so tests need no clock.
 */
export function createDragLimiter(
  perSecond: number = DRAG_PREVIEWS_PER_SECOND,
  now: () => number = Date.now,
): () => boolean {
  const minInterval = 1000 / perSecond;
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const current = now();
    if (current - last < minInterval) {
      return false;
    }
    last = current;
    return true;
  };
}

export interface DragPreview {
  /** What to send to the others: the position, kept on the scene. */
  readonly drag: TokenDrag;
  /** The token, so the caller can ask who may read it. */
  readonly token: Token;
}

/**
 * Validates a raw preview from `seat` and returns what to relay, or `undefined`
 * if it should be dropped: malformed, no seat, not allowed to move that token,
 * or no such token. The position is clamped to the token's scene so a client
 * cannot send a point off the map, but it is not snapped, so a drag stays smooth.
 */
export function previewTokenDrag(
  store: WorldStore,
  seat: Seat | undefined,
  raw: unknown,
): DragPreview | undefined {
  const parsed = tokenDragSchema.safeParse(raw);
  if (!parsed.success || seat === undefined) {
    return undefined;
  }
  try {
    const { token, scene } = loadMovableToken(store, seat, parsed.data.tokenId);
    return {
      token,
      drag: {
        tokenId: token.id,
        x: Math.min(parsed.data.x, scene.width),
        y: Math.min(parsed.data.y, scene.height),
      },
    };
  } catch (error) {
    if (error instanceof OperationRejected) {
      return undefined;
    }
    throw error;
  }
}
