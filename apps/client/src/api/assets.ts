/**
 * The client's view of `apps/server`'s image upload (`docs/assets.md`). The
 * file goes as the raw request body with its own media type, so it streams to
 * disk on the server and is never held in memory, and the device token says
 * which seat is uploading (a caller with no seat is refused).
 */

import { z } from 'zod';

import { getDeviceToken } from '../realtime/deviceToken.js';

/** The image types the server accepts. SVG is deliberately absent: it can carry script. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

const storedAssetSchema = z.object({
  /** `<hash>.<ext>`: what a document stores, never a URL. */
  name: z.string(),
  url: z.string(),
});

export type StoredAsset = z.infer<typeof storedAssetSchema>;

export function isAcceptedImage(file: { type: string }): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

/** Uploads `file` to `worldId`'s assets. Throws with the server's message when it refuses the file. */
export async function uploadAsset(worldId: string, file: File): Promise<StoredAsset> {
  const response = await fetch(`/api/worlds/${worldId}/assets`, {
    method: 'POST',
    headers: { 'content-type': file.type, 'x-device-token': getDeviceToken() },
    body: file,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const reason = z.object({ error: z.string() }).safeParse(body);
    throw new Error(
      reason.success
        ? reason.data.error
        : `failed to upload: server responded ${response.status}`,
    );
  }
  return storedAssetSchema.parse(body);
}

/** The URL an `<img>` loads a stored asset from. */
export function assetUrl(worldId: string, name: string): string {
  return `/api/worlds/${worldId}/assets/${name}`;
}
