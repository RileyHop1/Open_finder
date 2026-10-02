/**
 * Exits as plain data, the way `tokenModel.ts` does tokens: what to draw and list
 * for each of a scene's links, which one a click landed on, and where the party
 * should arrive on the other side. The canvas (`sceneView.ts`), the keyboard list
 * (`TokenList.vue`), and the "Move the party?" question all read the same
 * `ExitView`s, so they cannot disagree.
 *
 * Exits are the GM's: the GM moves the party (ADR 0017), so only the GM is shown
 * markers and offered the list. The scene's links are in the document a player
 * receives, but nothing in the player's screen draws or names them.
 */

import type { Scene } from '@hearthtable/core';

export interface ExitView {
  readonly id: string;
  /** What the GM called this exit ("Stairs down", "Back door"). */
  readonly label: string;
  /** Where the exit is on this scene, in scene pixels. */
  readonly x: number;
  readonly y: number;
  readonly targetSceneId: string;
  /** The target scene's name, or `undefined` if it is not there (the server removes links to a deleted scene, so this is a moment's lag at most). */
  readonly targetName: string | undefined;
}

/** `scene`'s exits, each with the name of the scene it leads to. */
export function exitViews(
  scene: Scene | undefined,
  scenes: readonly Scene[],
): ExitView[] {
  return (scene?.links ?? []).map((link) => ({
    id: link.id,
    label: link.label,
    x: link.x,
    y: link.y,
    targetSceneId: link.targetSceneId,
    targetName: scenes.find((s) => s.id === link.targetSceneId)?.name,
  }));
}

/** How far from an exit's position its marker reaches, in scene pixels, for a grid cell of `cell`. The canvas draws to it and the click test uses it, so what you see is what you can press. */
export function exitRadius(cell: number): number {
  return Math.max(cell * 0.35, 20);
}

/** The words for an exit in a list or to a screen reader: its label and where it goes. */
export function describeExit(exit: Pick<ExitView, 'label' | 'targetName'>): string {
  return `Exit: ${exit.label}, to ${exit.targetName ?? 'a scene that is gone'}`;
}

/** The exit whose marker contains `point` (scene pixels): the last one wins, as later ones draw over earlier ones. `reach` is the marker's radius in scene pixels. */
export function exitAt(
  exits: readonly ExitView[],
  point: { readonly x: number; readonly y: number },
  reach: number,
): ExitView | undefined {
  for (let index = exits.length - 1; index >= 0; index -= 1) {
    const exit = exits[index];
    if (exit !== undefined && Math.hypot(point.x - exit.x, point.y - exit.y) <= reach) {
      return exit;
    }
  }
  return undefined;
}

/**
 * Where the party should arrive in `target` when it comes from `fromSceneId`: at
 * the target's own exit back to where they came from, so they step out of the door
 * they used. An exit's position is in *its* scene's pixels, so the door on this
 * side says nothing about where the other side is; with no way back (or no target)
 * it is `undefined` and the server puts them in the middle.
 */
export function arrivalPoint(
  target: Scene | undefined,
  fromSceneId: string,
): { x: number; y: number } | undefined {
  const back = target?.links.find((link) => link.targetSceneId === fromSceneId);
  return back === undefined ? undefined : { x: back.x, y: back.y };
}
