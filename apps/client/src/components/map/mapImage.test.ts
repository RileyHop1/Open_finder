import { describe, expect, it, vi } from 'vitest';

import { fitWithin, loadMapBitmap, type MapImageDeps } from './mapImage.js';

describe('fitWithin', () => {
  it('leaves a picture that already fits', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 8192)).toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it('shrinks by the longer side and keeps the shape', () => {
    expect(fitWithin({ width: 16000, height: 8000 }, 8000)).toEqual({
      width: 8000,
      height: 4000,
    });
    expect(fitWithin({ width: 3000, height: 12000 }, 4096)).toEqual({
      width: 1024,
      height: 4096,
    });
  });

  it('never makes a side zero', () => {
    expect(fitWithin({ width: 100000, height: 10 }, 1000)).toEqual({
      width: 1000,
      height: 1,
    });
  });
});

describe('loadMapBitmap', () => {
  const picture = (width: number, height: number) => {
    const close = vi.fn();
    return { bitmap: { width, height, close } as unknown as ImageBitmap, close };
  };
  const blob = new Blob(['x']);

  function deps(natural: ImageBitmap, resized?: ImageBitmap) {
    const decode = vi.fn((_blob: Blob, resize?: unknown) =>
      Promise.resolve(resize === undefined || resized === undefined ? natural : resized),
    );
    const fetchImage = vi.fn(() => Promise.resolve(blob));
    return { decode, fetchImage, set: { decode, fetchImage } as MapImageDeps };
  }

  it('uses the picture as it is when it fits the limit', async () => {
    const natural = picture(4000, 3000);
    const { set, decode, fetchImage } = deps(natural.bitmap);

    expect(await loadMapBitmap('/map.png', 8192, set)).toBe(natural.bitmap);
    expect(fetchImage).toHaveBeenCalledWith('/map.png');
    expect(decode).toHaveBeenCalledTimes(1);
    expect(natural.close).not.toHaveBeenCalled();
  });

  it('decodes a smaller copy when it does not, and lets the big one go', async () => {
    const natural = picture(16000, 8000);
    const small = picture(8000, 4000);
    const { set, decode } = deps(natural.bitmap, small.bitmap);

    expect(await loadMapBitmap('/map.png', 8000, set)).toBe(small.bitmap);
    expect(decode).toHaveBeenLastCalledWith(blob, {
      resizeWidth: 8000,
      resizeHeight: 4000,
      resizeQuality: 'high',
    });
    expect(natural.close).toHaveBeenCalledTimes(1);
  });

  it('passes a failed fetch on, so the caller can say so', async () => {
    const set: MapImageDeps = {
      fetchImage: () => Promise.reject(new Error('offline')),
      decode: vi.fn(),
    };
    await expect(loadMapBitmap('/map.png', 8192, set)).rejects.toThrow('offline');
  });
});
