/**
 * The cells a placed area template covers, by its own shape -- the same math
 * `apps/server/src/templates.ts`'s `creaturesCaught` uses, so a rendered
 * template and the server's own idea of it never disagree. Kept apart from
 * the component so the geometry is testable without mounting anything or
 * touching PixiJS.
 */
import type { Cell, GridStrategy, Template, Token } from '@hearthtable/core';

/** The source token for an emanation, or undefined if it cannot be found (nothing is highlighted then). */
export function cellsFor(
  grid: GridStrategy,
  template: Pick<
    Template,
    'shape' | 'x' | 'y' | 'toX' | 'toY' | 'feet' | 'widthFeet' | 'tokenId'
  >,
  tokens: readonly Pick<Token, 'id' | 'x' | 'y' | 'size'>[],
): Cell[] {
  const origin = { x: template.x, y: template.y };
  const aim = { x: template.toX ?? template.x, y: template.toY ?? template.y };
  switch (template.shape) {
    case 'burst':
      return grid.burst(origin, template.feet);
    case 'cone':
      return grid.cone(origin, aim, template.feet);
    case 'line':
      return grid.line(origin, aim, template.widthFeet);
    case 'emanation': {
      const source = tokens.find((token) => token.id === template.tokenId);
      return source === undefined
        ? []
        : grid.emanation(
            { center: { x: source.x, y: source.y }, size: source.size },
            template.feet,
          );
    }
  }
}
