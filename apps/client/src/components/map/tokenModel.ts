/**
 * What to draw for each token, worked out as plain data so the choices (whose
 * name, which initials, how big) are unit tests rather than things to squint at
 * on a canvas. `sceneView.ts` turns these into sprites and `TokenList.vue` into
 * the keyboard-reachable list; both read the same objects, so the canvas and the
 * list cannot disagree about what is on the map.
 */

import type { Actor, Seat, Token } from '@hearthtable/core';
import { resolvePermission } from '@hearthtable/core';

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
  /** Footprint side in grid squares, which the grid needs to snap it. */
  readonly size: number;
  /** Footprint side in scene pixels: the token's squares times the grid's cell. */
  readonly diameter: number;
  /** Faded and labelled "hidden" for the GM; the server never sends a hidden token to anyone else. */
  readonly hidden: boolean;
  /** The portrait's asset name, if the actor has one. */
  readonly portrait: string | undefined;
  /** Whether this seat can open the actor's sheet. */
  readonly openable: boolean;
  /** Whether this seat may move it: the GM any, a player the tokens of actors they own. The server enforces it too. */
  readonly movable: boolean;
  /** The token the keyboard and the next move act on. */
  readonly selected: boolean;
  /** Whose combatant is acting right now. Never true outside an active combat. */
  readonly onTurn: boolean;
  /** Current and maximum hit points for the bar, or `undefined` when this seat is shown none. */
  readonly hp: { readonly current: number; readonly max: number } | undefined;
  /** GM only: a bar the players cannot see, drawn dashed so the GM can tell. */
  readonly hpHidden: boolean;
  /** Whether this is a monster whose bar the GM may show or hide (a character's is always shown). */
  readonly npc: boolean;
  /** Whether players are shown this token's bar (the GM's switch). */
  readonly showHpBar: boolean;
}

/** Whether `seat` may move a token of `actor` (ADR 0017: owners and the GM; the actor is undefined when this seat cannot see it). */
export function canMoveToken(seat: Seat | undefined, actor: Actor | undefined): boolean {
  if (seat === undefined) {
    return false;
  }
  return seat.isGM || (actor !== undefined && resolvePermission(seat, actor) === 'owner');
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

/** An actor's hit points, as `actorHp` reports them. */
type ActorHp = { kind: 'character' | 'npc'; current: number; max: number };

export interface TokenViewOptions {
  readonly selectedId?: string | undefined;
  /** Whether this seat may move a token of this actor. Defaults to no. */
  readonly canMove?: ((actorId: string) => boolean) | undefined;
  /** The active combatant's token, if any; drives `onTurn`. */
  readonly activeTokenId?: string | undefined;
  /** Whether this seat is the GM, who sees every bar. */
  readonly gm?: boolean | undefined;
  /** The actor's kind and hit points, for an actor this seat can read. */
  readonly hpOf?: ((actorId: string) => ActorHp | undefined) | undefined;
}

/**
 * The bar to draw for one token. A character's comes from the actor and is shown to
 * everyone who can read it. A monster's comes from the actor for the GM (dashed when
 * the players are not shown it), and from the token's server-maintained `hpBar` for
 * a player, who is never handed more than those two numbers.
 */
function hpBarOf(
  token: Token,
  info: ActorHp | undefined,
  gm: boolean,
): { hp: TokenView['hp']; hidden: boolean } {
  if (info?.kind === 'character') {
    return { hp: { current: info.current, max: info.max }, hidden: false };
  }
  if (gm && info?.kind === 'npc') {
    return { hp: { current: info.current, max: info.max }, hidden: !token.showHpBar };
  }
  return { hp: token.hpBar, hidden: false };
}

export function tokenViews(
  tokens: readonly Token[],
  gridSize: number,
  actorOf: (actorId: string) => TokenActor | undefined,
  options: TokenViewOptions = {},
): TokenView[] {
  return tokens.map((token) => {
    const actor = actorOf(token.actorId);
    const label = token.name ?? actor?.name ?? UNKNOWN_LABEL;
    const info = options.hpOf?.(token.actorId);
    const bar = hpBarOf(token, info, options.gm === true);
    return {
      id: token.id,
      actorId: token.actorId,
      label,
      initials: initialsOf(label),
      x: token.x,
      y: token.y,
      size: token.size,
      diameter: token.size * gridSize,
      hidden: token.hidden,
      portrait: actor?.portrait,
      openable: actor !== undefined,
      movable: options.canMove?.(token.actorId) ?? false,
      selected: token.id === options.selectedId,
      onTurn: token.id === options.activeTokenId,
      hp: bar.hp,
      hpHidden: bar.hidden,
      npc: info?.kind === 'npc',
      showHpBar: token.showHpBar,
    };
  });
}

/** The text drawn under a token on the map: just its name and health (`Goblin 12/40`). Hidden and on-turn are already shown by fading and a ring, so they stay out of it; `describeToken` has them in words. */
export function tokenCaption(view: Pick<TokenView, 'label' | 'hp'>): string {
  return view.hp === undefined
    ? view.label
    : `${view.label} ${view.hp.current}/${view.hp.max}`;
}

/** The words a list or a screen reader gets for a token: its label, health as `12/40`, and "hidden" or "current turn" when true (never colour or fading alone). */
export function describeToken(
  view: Pick<TokenView, 'label' | 'hidden' | 'onTurn'> & Partial<Pick<TokenView, 'hp'>>,
): string {
  const name =
    view.hp === undefined
      ? view.label
      : `${view.label} ${view.hp.current}/${view.hp.max}`;
  const suffix = [
    view.hidden ? 'hidden' : undefined,
    view.onTurn ? 'current turn' : undefined,
  ]
    .filter((word) => word !== undefined)
    .join(', ');
  return suffix === '' ? name : `${name} (${suffix})`;
}

/** The topmost token whose circle contains `point` (scene pixels): later tokens draw over earlier ones, so the last match wins. */
export function tokenAt(
  views: readonly TokenView[],
  point: { readonly x: number; readonly y: number },
): TokenView | undefined {
  for (let index = views.length - 1; index >= 0; index -= 1) {
    const view = views[index];
    if (
      view !== undefined &&
      Math.hypot(point.x - view.x, point.y - view.y) <= view.diameter / 2
    ) {
      return view;
    }
  }
  return undefined;
}
