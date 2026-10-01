/**
 * What to draw for each token, worked out as plain data so the choices (whose
 * name, which initials, how big) are unit tests rather than things to squint at
 * on a canvas. `sceneView.ts` turns these into sprites and `TokenList.vue` into
 * the keyboard-reachable list; both read the same objects, so the canvas and the
 * list cannot disagree about what is on the map.
 */

import type { Token } from '@hearthtable/core';

/** The slice of an actor a token needs. A seat that cannot see the actor (a monster's sheet is the GM's) has none, and the token still shows. */
export interface TokenActor {
  readonly name: string;
  readonly portrait?: string | undefined;
}

export interface TokenView {
  readonly id: string;
  /** Who it stands for, so a click or Enter can open their sheet. */
  readonly actorId: string;
  /** The token's own label, else the actor's name, else a plain word: a player is never shown a monster's real name unless the GM gave the token one. */
  readonly label: string;
  /** One or two letters shown when there is no portrait. */
  readonly initials: string;
  /** The centre, in scene pixels. */
  readonly x: number;
  readonly y: number;
  /** Footprint side in scene pixels: the token's squares times the grid's cell. */
  readonly diameter: number;
  /** Faded and labelled "hidden" for the GM; the server never sends a hidden token to anyone else. */
  readonly hidden: boolean;
  /** The portrait's asset name, if the actor has one. */
  readonly portrait: string | undefined;
  /** Whether this seat can open the actor's sheet. */
  readonly openable: boolean;
}

/** `Goblin Warrior` -> `GW`; `Valeros` -> `V`; blank -> `?`. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 0);
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined]
    .map((word) => (word === undefined ? '' : (Array.from(word)[0] ?? '')))
    .join('');
  return letters === '' ? '?' : letters.toUpperCase();
}

/** The word shown for a token that has neither a label of its own nor an actor this seat can see. */
export const UNKNOWN_LABEL = 'Unknown';

export function tokenViews(
  tokens: readonly Token[],
  gridSize: number,
  actorOf: (actorId: string) => TokenActor | undefined,
): TokenView[] {
  return tokens.map((token) => {
    const actor = actorOf(token.actorId);
    const label = token.name ?? actor?.name ?? UNKNOWN_LABEL;
    return {
      id: token.id,
      actorId: token.actorId,
      label,
      initials: initialsOf(label),
      x: token.x,
      y: token.y,
      diameter: token.size * gridSize,
      hidden: token.hidden,
      portrait: actor?.portrait,
      openable: actor !== undefined,
    };
  });
}

/** The words a list or a screen reader gets for a token: its label, and "hidden" when that is true (never colour or fading alone). */
export function describeToken(view: Pick<TokenView, 'label' | 'hidden'>): string {
  return view.hidden ? `${view.label} (hidden)` : view.label;
}
