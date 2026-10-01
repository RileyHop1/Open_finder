/**
 * The grid a scene is measured and snapped with, on the client: the same choice
 * the server makes (`apps/server/src/tokens.ts`, `gridFor`), so a token placed
 * on screen lands where the server will put it. A gridless scene is freeform;
 * anything else is the PF2e square grid.
 */

import type { GridStrategy, Scene } from '@hearthtable/core';
import { GridlessGrid } from '@hearthtable/core';
import { SquareGrid } from '@hearthtable/pf2e';

export function gridForScene(scene: Pick<Scene, 'grid'>): GridStrategy {
  return scene.grid.type === 'none'
    ? new GridlessGrid(scene.grid)
    : new SquareGrid(scene.grid);
}
