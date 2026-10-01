/**
 * Draws one scene into a PixiJS application: the map picture (or a plain
 * backdrop when the scene has none) and the grid over it, inside a `world`
 * container that the camera moves and scales, with the tokens in a layer above.
 *
 * **The grid is a cached texture, not lines.** One cell's top and left edges
 * are drawn once into a small texture, which a `TilingSprite` repeats across
 * the scene. Redrawing a few hundred `Graphics` lines every frame is what the
 * canvas budget cannot afford (ADR 0017); this costs one draw call however
 * many cells there are, and the grid offset is just the tile's position.
 *
 * Needs a real WebGL context, so it is exercised in a browser (the stress
 * scene of D.1 and the e2e flow of D.2), while everything with logic in it
 * (the camera, the image limits) is pure and unit-tested.
 */

import type { Scene } from '@hearthtable/core';
import type * as Pixi from 'pixi.js';

import { type Camera, type Size, worldTransform } from './camera.js';
import { FALLBACK_MAX_TEXTURE_SIZE } from './mapImage.js';
import type { TokenView } from './tokenModel.js';

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
  // Two layers, so a redraw of the map never lands on top of the tokens.
  const mapLayer = new pixi.Container();
  const tokenLayer = new pixi.Container();
  world.addChild(mapLayer, tokenLayer);
  app.stage.addChild(world);

  /** Everything `update` made, so the next one can release it. */
  let drawn: { destroy: () => void }[] = [];

  function clear(): void {
    for (const item of drawn) {
      item.destroy();
    }
    drawn = [];
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
    node.addChild(
      new pixi.Graphics()
        .circle(0, 0, radius)
        .stroke({ width: Math.max(3, radius * 0.06), color: 0xece7dc }),
    );

    const name = new pixi.Text({
      text: view.hidden ? `${view.label} (hidden)` : view.label,
      style: {
        fill: 0xffffff,
        fontSize,
        stroke: { color: 0x000000, width: Math.max(3, fontSize * 0.2) },
      },
    });
    name.anchor.set(0.5, 0);
    name.position.set(0, radius + fontSize * 0.2);
    node.addChild(name);

    // Faded for a token only the GM can see; the label says so in words too.
    node.alpha = view.hidden ? 0.5 : 1;
    return node;
  }

  return {
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
        drawn.push({
          destroy: () => grid.destroy({ texture: true, textureSource: true }),
        });
      }
    },

    setCamera(camera, viewport) {
      const transform = worldTransform(camera, viewport);
      world.position.set(transform.x, transform.y);
      world.scale.set(transform.scale);
    },

    destroy() {
      clear();
      for (const texture of portraitTextures.values()) {
        texture.destroy(true);
      }
      portraitTextures.clear();
      tokenNodes.clear();
      world.destroy({ children: true });
    },
  };
}
