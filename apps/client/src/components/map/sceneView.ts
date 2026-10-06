/**
 * Draws one scene into a PixiJS application: the map picture (or a plain
 * backdrop when the scene has none) and the grid over it, inside a `world`
 * container that the camera moves and scales, with the tokens in a layer above.
 *
 * **The grid is a cached texture, not lines.** One cell's top and left edges
 * are drawn once into a small texture, which a `TilingSprite` repeats across
 * the scene. Redrawing a few hundred `Graphics` lines every frame is what the
 * canvas budget cannot afford (ADR 0017); this costs one draw call however
 * many cells there are, and the grid offset is just the tile's position. Far
 * zoomed out the lines are thinner than a pixel and alias into bands, so the grid
 * fades out as a cell shrinks below 16 screen pixels and is gone under 4
 * (`gridAlpha`).
 *
 * Needs a real WebGL context, so it is exercised in a browser (the stress
 * scene of D.1 and the e2e flow of D.2), while everything with logic in it
 * (the camera, the image limits) is pure and unit-tested.
 */

import type { Cell, Point, Scene, SceneGrid } from '@hearthtable/core';
import type * as Pixi from 'pixi.js';

import { type Camera, gridAlpha, type Size, worldTransform } from './camera.js';
import { type ExitView, exitRadius } from './exitModel.js';
import { FALLBACK_MAX_TEXTURE_SIZE } from './mapImage.js';
import { hpPercent } from '../actorHp.js';
import { describeToken, type TokenView } from './tokenModel.js';

export interface SceneView {
  /** Replaces what is drawn with `scene`, using `background` (already shrunk to fit the GPU) as its picture. */
  update(scene: Scene, background: ImageBitmap | undefined): void;
  setCamera(camera: Camera, viewport: Size): void;
  /**
   * Makes the tokens on screen exactly `views`. A token that only moved just has
   * its position set; one whose look changed is rebuilt; one that is gone is
   * removed. `portraits` holds the decoded pictures by asset name; `cell` is the
   * grid's cell size, which sizes the labels.
   */
  setTokens(
    views: readonly TokenView[],
    portraits: ReadonlyMap<string, ImageBitmap>,
    cell: number,
  ): void;
  /**
   * Makes the exit markers on screen exactly `exits`: a diamond with an arrow in
   * it and the exit's label beneath (a shape and words, never colour alone). `cell`
   * sizes them like the tokens. They draw under the tokens.
   */
  setExits(exits: readonly ExitView[], cell: number): void;
  /**
   * Draws the measuring ruler through `points` (scene pixels; none clears it): a
   * line with a dot at each, above the tokens. Local to this screen, never sent.
   */
  setRuler(points: readonly Point[], cell: number): void;
  /**
   * Shades `cells` red at low opacity (an empty array clears it): the action
   * bar's range highlight while a strike is hovered, under the tokens so a
   * portrait is never obscured. Local to this screen, never sent.
   */
  setHighlightedCells(cells: readonly Cell[], grid: SceneGrid): void;
  /**
   * Shades `cells` blue at low opacity (an empty array clears it): the area
   * templates placed on this scene (M5 C.9), under the tokens like the range
   * highlight. Local to this screen, never sent.
   */
  setTemplateCells(cells: readonly Cell[], grid: SceneGrid): void;
  destroy(): void;
}

/** The largest texture side the graphics card will take, or a safe guess if it will not say. */
export function maxTextureSize(app: Pixi.Application): number {
  const renderer = app.renderer;
  if ('gl' in renderer) {
    const size: unknown = renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE);
    if (typeof size === 'number' && size > 0) {
      return size;
    }
  }
  return FALLBACK_MAX_TEXTURE_SIZE;
}

const BACKDROP_COLOUR = 0x2b2722;

export function createSceneView(pixi: typeof Pixi, app: Pixi.Application): SceneView {
  const world = new pixi.Container();
  // Layered so a redraw of the map never lands on top of the tokens, and the
  // range highlight sits under them too.
  const mapLayer = new pixi.Container();
  const templateLayer = new pixi.Container();
  const highlightLayer = new pixi.Container();
  const exitLayer = new pixi.Container();
  const tokenLayer = new pixi.Container();
  const rulerLayer = new pixi.Container();
  world.addChild(
    mapLayer,
    templateLayer,
    highlightLayer,
    exitLayer,
    tokenLayer,
    rulerLayer,
  );
  app.stage.addChild(world);

  /** The grid sprite and its cell size, so `setCamera` can fade it as the cells shrink (`gridAlpha`). */
  let gridSprite: { sprite: Pixi.TilingSprite; cell: number } | undefined;

  /** Everything `update` made, so the next one can release it. */
  let drawn: { destroy: () => void }[] = [];

  function clear(): void {
    for (const item of drawn) {
      item.destroy();
    }
    drawn = [];
    gridSprite = undefined;
  }

  /** One cell's top and left edges: a dark line under a light one, so it shows on a pale map and a dark one. */
  function gridTexture(size: number): Pixi.Texture {
    const edges = new pixi.Graphics();
    for (const [width, colour, alpha] of [
      [4, 0x000000, 0.25],
      [2, 0xffffff, 0.5],
    ] as const) {
      edges
        .moveTo(1, 1)
        .lineTo(size, 1)
        .moveTo(1, 1)
        .lineTo(1, size)
        .stroke({ width, color: colour, alpha });
    }
    const texture = app.renderer.generateTexture({
      target: edges,
      frame: new pixi.Rectangle(0, 0, size, size),
      resolution: 1,
    });
    edges.destroy();
    // Zoomed out, a two-pixel line is a fraction of a screen pixel; mipmaps average it
    // instead of letting some lines vanish and others stay sharp.
    texture.source.autoGenerateMipmaps = true;
    texture.source.style.mipmapFilter = 'linear';
    return texture;
  }

  /** What is on screen for each token, with the look it was built for, so an unchanged token is left alone. */
  const tokenNodes = new Map<string, { node: Pixi.Container; look: string }>();
  const portraitTextures = new Map<string, Pixi.Texture>();

  function textureFor(name: string, bitmap: ImageBitmap): Pixi.Texture {
    let texture = portraitTextures.get(name);
    if (texture === undefined) {
      texture = pixi.Texture.from(bitmap);
      portraitTextures.set(name, texture);
    }
    return texture;
  }

  /** A token: a ring with its portrait cut to a circle (or its initials), and its name beneath. */
  /** The HP bar: a dark track, a fill coloured by how full it is, and a dashed outline when only the GM sees it. */
  function drawHpBar(view: TokenView, radius: number, height: number): Pixi.Graphics {
    const percent = view.hp === undefined ? 0 : hpPercent(view.hp.current, view.hp.max);
    const width = Math.max(view.diameter * 0.8, 24);
    const left = -width / 2;
    const top = radius + 4;
    const bar = new pixi.Graphics().rect(left, top, width, height).fill(0x1a1713);
    if (percent > 0) {
      const colour = percent > 50 ? 0x5fb86a : percent > 25 ? 0xe0a93b : 0xd9534f;
      bar.rect(left, top, (width * percent) / 100, height).fill(colour);
    }
    if (view.hpHidden) {
      const dash = Math.max(height, 6);
      for (let at = 0; at < width; at += dash * 2) {
        const length = Math.min(dash, width - at);
        bar
          .rect(left + at, top - 2, length, 2)
          .rect(left + at, top + height, length, 2)
          .fill(0xece7dc);
      }
    }
    return bar;
  }

  function buildToken(
    view: TokenView,
    portrait: Pixi.Texture | undefined,
    cell: number,
  ): Pixi.Container {
    const node = new pixi.Container();
    const radius = view.diameter / 2;
    const fontSize = Math.min(Math.max(cell * 0.2, 14), 40);

    node.addChild(new pixi.Graphics().circle(0, 0, radius).fill(0x3a342d));
    if (portrait === undefined) {
      const initials = new pixi.Text({
        text: view.initials,
        style: { fill: 0xece7dc, fontSize: radius * 0.9, fontWeight: 'bold' },
      });
      initials.anchor.set(0.5);
      node.addChild(initials);
    } else {
      // The picture fills the circle, scaled to cover it and centred: a texture fill, not a
      // mask, so there is nothing to render twice or to leak between draws.
      const scale = Math.max(
        view.diameter / portrait.width,
        view.diameter / portrait.height,
      );
      node.addChild(
        new pixi.Graphics().circle(0, 0, radius).fill({
          texture: portrait,
          textureSpace: 'global',
          matrix: new pixi.Matrix()
            .scale(scale, scale)
            .translate((-portrait.width * scale) / 2, (-portrait.height * scale) / 2),
        }),
      );
    }
    // The selected token has a thicker, warmer ring and a second ring outside it: a shape
    // change as well as a colour one.
    node.addChild(
      new pixi.Graphics().circle(0, 0, radius).stroke({
        width: Math.max(view.selected ? 6 : 3, radius * (view.selected ? 0.1 : 0.06)),
        color: view.selected ? 0xffc857 : 0xece7dc,
      }),
    );
    if (view.selected) {
      node.addChild(
        new pixi.Graphics()
          .circle(0, 0, radius + Math.max(8, radius * 0.12))
          .stroke({ width: 3, color: 0xffc857, alpha: 0.8 }),
      );
    }
    // The combatant whose turn it is gets its own ring, a second colour so it
    // never collides with (and reads independently of) the selection ring.
    if (view.onTurn) {
      node.addChild(
        new pixi.Graphics()
          .circle(0, 0, radius + Math.max(14, radius * 0.2))
          .stroke({ width: 3, color: 0x5fb86a, alpha: 0.9 }),
      );
    }

    // A thin bar just under the token, its label pushed below it. A bar the players
    // are not shown (GM only) gets a dashed outline: a shape, not just a colour.
    const barHeight = view.hp === undefined ? 0 : Math.max(cell * 0.09, 7);
    if (view.hp !== undefined) {
      node.addChild(drawHpBar(view, radius, barHeight));
    }

    const name = new pixi.Text({
      text: describeToken(view),
      style: {
        fill: 0xffffff,
        fontSize,
        stroke: { color: 0x000000, width: Math.max(3, fontSize * 0.2) },
      },
    });
    name.anchor.set(0.5, 0);
    name.position.set(0, radius + fontSize * 0.2 + (barHeight > 0 ? barHeight + 4 : 0));
    node.addChild(name);

    // Faded for a token only the GM can see; the label says so in words too.
    node.alpha = view.hidden ? 0.5 : 1;
    return node;
  }

  /** What the exit layer was built from, so an unchanged set is left alone. */
  let exitsLook = '';

  return {
    setRuler(points, cell) {
      for (const child of rulerLayer.removeChildren()) {
        child.destroy({ children: true });
      }
      if (points.length === 0) {
        return;
      }
      const width = Math.max(cell * 0.06, 3);
      const line = new pixi.Graphics();
      points.forEach((point, index) => {
        if (index === 0) {
          line.moveTo(point.x, point.y);
        } else {
          line.lineTo(point.x, point.y);
        }
      });
      // A dark line under a light one, so it shows on a pale map and a dark one.
      line.stroke({ width: width * 2, color: 0x000000, alpha: 0.5 });
      points.forEach((point, index) => {
        if (index === 0) {
          line.moveTo(point.x, point.y);
        } else {
          line.lineTo(point.x, point.y);
        }
      });
      line.stroke({ width, color: 0xffc857 });
      for (const point of points) {
        line.circle(point.x, point.y, width * 1.6).fill(0xffc857);
      }
      rulerLayer.addChild(line);
    },

    setHighlightedCells(cells, grid) {
      for (const child of highlightLayer.removeChildren()) {
        child.destroy({ children: true });
      }
      if (cells.length === 0) {
        return;
      }
      const shade = new pixi.Graphics();
      for (const cell of cells) {
        shade.rect(
          grid.offsetX + cell.col * grid.size,
          grid.offsetY + cell.row * grid.size,
          grid.size,
          grid.size,
        );
      }
      shade.fill({ color: 0xcc3333, alpha: 0.3 });
      highlightLayer.addChild(shade);
    },

    setTemplateCells(cells, grid) {
      for (const child of templateLayer.removeChildren()) {
        child.destroy({ children: true });
      }
      if (cells.length === 0) {
        return;
      }
      const shade = new pixi.Graphics();
      for (const cell of cells) {
        shade.rect(
          grid.offsetX + cell.col * grid.size,
          grid.offsetY + cell.row * grid.size,
          grid.size,
          grid.size,
        );
      }
      shade.fill({ color: 0x3366cc, alpha: 0.3 });
      templateLayer.addChild(shade);
    },

    setExits(exits, cell) {
      const look = JSON.stringify([exits.map((e) => [e.id, e.label, e.x, e.y]), cell]);
      if (look === exitsLook) {
        return;
      }
      exitsLook = look;
      for (const child of exitLayer.removeChildren()) {
        child.destroy({ children: true });
      }
      const radius = exitRadius(cell);
      const fontSize = Math.min(Math.max(cell * 0.2, 14), 40);
      for (const exit of exits) {
        const node = new pixi.Container();
        node.addChild(
          new pixi.Graphics()
            .poly([0, -radius, radius, 0, 0, radius, -radius, 0])
            .fill(0x1f6f8b)
            .stroke({ width: 4, color: 0xece7dc }),
        );
        const arrow = radius * 0.45;
        node.addChild(
          new pixi.Graphics()
            .poly([-arrow, -arrow * 0.6, arrow, 0, -arrow, arrow * 0.6])
            .fill(0xece7dc),
        );
        const name = new pixi.Text({
          text: exit.label,
          style: {
            fill: 0xffffff,
            fontSize,
            stroke: { color: 0x000000, width: Math.max(3, fontSize * 0.2) },
          },
        });
        name.anchor.set(0.5, 0);
        name.position.set(0, radius + fontSize * 0.2);
        node.addChild(name);
        node.position.set(exit.x, exit.y);
        exitLayer.addChild(node);
      }
    },

    setTokens(views, portraits, cell) {
      const wanted = new Set(views.map((view) => view.id));
      for (const [id, entry] of tokenNodes) {
        if (!wanted.has(id)) {
          entry.node.destroy({ children: true });
          tokenNodes.delete(id);
        }
      }
      for (const view of views) {
        const bitmap =
          view.portrait === undefined ? undefined : portraits.get(view.portrait);
        const look = [
          view.diameter,
          view.label,
          view.initials,
          view.hidden,
          view.selected,
          view.onTurn,
          view.hp?.current,
          view.hp?.max,
          view.hpHidden,
          cell,
          view.portrait,
          bitmap !== undefined,
        ].join('|');
        let entry = tokenNodes.get(view.id);
        if (entry?.look !== look) {
          entry?.node.destroy({ children: true });
          const texture =
            view.portrait === undefined || bitmap === undefined
              ? undefined
              : textureFor(view.portrait, bitmap);
          entry = { node: buildToken(view, texture, cell), look };
          tokenLayer.addChild(entry.node);
          tokenNodes.set(view.id, entry);
        }
        entry.node.position.set(view.x, view.y);
      }
    },

    update(scene, background) {
      clear();

      if (background === undefined) {
        const backdrop = new pixi.Graphics()
          .rect(0, 0, scene.width, scene.height)
          .fill(BACKDROP_COLOUR);
        mapLayer.addChild(backdrop);
        drawn.push(backdrop);
      } else {
        const texture = pixi.Texture.from(background);
        // Stretched to the scene's size: a picture shrunk for the GPU still lines up with the grid.
        const sprite = new pixi.Sprite({
          texture,
          width: scene.width,
          height: scene.height,
        });
        mapLayer.addChild(sprite);
        drawn.push({
          destroy: () => {
            sprite.destroy({ texture: true, textureSource: true });
            background.close();
          },
        });
      }

      if (scene.grid.type === 'square') {
        const texture = gridTexture(scene.grid.size);
        const grid = new pixi.TilingSprite({
          texture,
          width: scene.width,
          height: scene.height,
          tilePosition: { x: scene.grid.offsetX, y: scene.grid.offsetY },
        });
        mapLayer.addChild(grid);
        gridSprite = { sprite: grid, cell: scene.grid.size };
        drawn.push({
          destroy: () => grid.destroy({ texture: true, textureSource: true }),
        });
      }
    },

    setCamera(camera, viewport) {
      const transform = worldTransform(camera, viewport);
      world.position.set(transform.x, transform.y);
      world.scale.set(transform.scale);
      if (gridSprite !== undefined) {
        gridSprite.sprite.alpha = gridAlpha(gridSprite.cell * transform.scale);
      }
    },

    destroy() {
      clear();
      for (const texture of portraitTextures.values()) {
        texture.destroy(true);
      }
      portraitTextures.clear();
      tokenNodes.clear();
      exitsLook = '';
      world.destroy({ children: true });
    },
  };
}
