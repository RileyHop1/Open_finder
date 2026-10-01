// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDeviceToken } from '../realtime/deviceToken.js';
import { assetUrl, isAcceptedImage, uploadAsset } from './assets.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const png = () =>
  new File([new Uint8Array([0x89, 0x50])], 'p.png', { type: 'image/png' });

describe('uploadAsset', () => {
  it('posts the raw file with its own type and this device token, and returns the stored name', async () => {
    const file = png();
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          name: `${'a'.repeat(64)}.png`,
          url: '/x',
          hash: 'a',
          contentType: 'image/png',
          size: 2,
        },
        201,
      ),
    );

    const stored = await uploadAsset('world-1', file);

    expect(stored.name).toBe(`${'a'.repeat(64)}.png`);
    expect(fetchMock).toHaveBeenCalledWith('/api/worlds/world-1/assets', {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'x-device-token': getDeviceToken() },
      body: file,
    });
  });

  it('throws the server’s own message when it refuses the file', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'the file is not a valid image of that type' }, 400),
    );
    await expect(uploadAsset('w', png())).rejects.toThrow(
      'the file is not a valid image of that type',
    );
  });

  it('falls back to the status when the failure has no readable body', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }));
    await expect(uploadAsset('w', png())).rejects.toThrow(/responded 502/);
  });
});

describe('isAcceptedImage', () => {
  it('accepts the four raster types and refuses SVG and everything else', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(isAcceptedImage({ type })).toBe(true);
    }
    for (const type of ['image/svg+xml', 'text/html', 'application/pdf', '']) {
      expect(isAcceptedImage({ type })).toBe(false);
    }
  });
});

describe('assetUrl', () => {
  it('points an image at the world’s asset route', () => {
    expect(assetUrl('w1', 'abc.png')).toBe('/api/worlds/w1/assets/abc.png');
  });
});
