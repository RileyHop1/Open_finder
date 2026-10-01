/**
 * Draws one scene into a PixiJS application: the map picture (or a plain
 * backdrop when the scene has none) and the grid over it, inside a `world`
 * container that the camera moves and scales. Tokens join this container in a
 * later PR.
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

export interface SceneView {
  /** Replaces what is drawn with `scene`, using `background` (already shrunk to fit the GPU) as its picture. */
  update(scene: Scene, background: ImageBitmap | undefined): void;
  setCamera(camera: Camera, viewport: Size): void;
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

  return {
    update(scene, background) {
      clear();

      if (background === undefined) {
        const backdrop = new pixi.Graphics()
          .rect(0, 0, scene.width, scene.height)
          .fill(BACKDROP_COLOUR);
        world.addChild(backdrop);
        drawn.push(backdrop);
      } else {
        const texture = pixi.Texture.from(background);
        // Stretched to the scene's size: a picture shrunk for the GPU still lines up with the grid.
        const sprite = new pixi.Sprite({
          texture,
          width: scene.width,
          height: scene.height,
        });
        world.addChild(sprite);
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
        world.addChild(grid);
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
      world.destroy({ children: true });
    },
  };
}
