/**
 * Getting a map picture ready for the GPU. A map may be far larger than the
 * biggest texture a graphics card will take (8192 on many integrated GPUs, as
 * low as 4096 on some Safari setups; ADR 0017), so it is shrunk on the way in
 * to fit, keeping its shape. The stored file is never touched: this only
 * decides what is uploaded. The sprite is then stretched to the scene's own
 * size, so a shrunken picture lines up with the grid exactly as the original
 * would.
 */

import type { Size } from './camera.js';

/** What to assume when the graphics card will not say: every WebGL2 device supports at least 2048, and 4096 is near-universal. */
export const FALLBACK_MAX_TEXTURE_SIZE = 4096;

/** `size` scaled down, keeping its shape, until both sides are at most `max`. Never scaled up. */
export function fitWithin(size: Size, max: number): Size {
  const scale = Math.min(1, max / Math.max(size.width, size.height));
  return scale === 1
    ? size
    : {
        width: Math.max(1, Math.floor(size.width * scale)),
        height: Math.max(1, Math.floor(size.height * scale)),
      };
}

export interface MapImageDeps {
  readonly fetchImage: (url: string) => Promise<Blob>;
  readonly decode: (
    blob: Blob,
    resize?: { resizeWidth: number; resizeHeight: number; resizeQuality: 'high' },
  ) => Promise<ImageBitmap>;
}

const browser: MapImageDeps = {
  fetchImage: async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`failed to load the map: server responded ${response.status}`);
    }
    return response.blob();
  },
  decode: (blob, resize) =>
    resize === undefined ? createImageBitmap(blob) : createImageBitmap(blob, resize),
};

/**
 * Fetches the picture at `url` and decodes it, shrunk to fit `maxTextureSize`
 * if it is bigger. The decoder does the shrinking, so the full-size bitmap is
 * not held once a smaller one exists.
 */
export async function loadMapBitmap(
  url: string,
  maxTextureSize: number,
  deps: MapImageDeps = browser,
): Promise<ImageBitmap> {
  const blob = await deps.fetchImage(url);
  const natural = await deps.decode(blob);
  const target = fitWithin(
    { width: natural.width, height: natural.height },
    maxTextureSize,
  );
  if (target.width === natural.width && target.height === natural.height) {
    return natural;
  }
  natural.close();
  return deps.decode(blob, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  });
}
