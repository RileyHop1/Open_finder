/**
 * Content-addressed image assets in a world's `assets/` folder
 * (CLAUDE.md, World folder layout): a file is stored as
 * `<sha256 hex>.<ext>`, so the same picture uploaded twice is stored once and
 * the export archive dedupes for free.
 *
 * Uploads stream: the body is hashed and written to a temporary file chunk by
 * chunk, then renamed to its hash, so a large map never sits in memory
 * (assets are explicitly unbounded). The **content** is checked, not the
 * label: the first bytes must be the signature of the image type the request
 * claims, so an upload cannot pass as a picture while being something else.
 */

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** The image types accepted, by media type, with the extension each is stored under. */
export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([type, extension]) => [extension, type]),
);

/** A stored asset's file name: 64 lowercase hex characters, a dot, a known extension. */
export const ASSET_NAME_PATTERN = /^[0-9a-f]{64}\.(png|jpg|webp|gif)$/;

/** The media type to serve asset `name` as, or `undefined` if it is not a valid asset name. */
export function contentTypeOfAsset(name: string): string | undefined {
  return ASSET_NAME_PATTERN.test(name)
    ? CONTENT_TYPE_BY_EXTENSION[name.slice(name.lastIndexOf('.') + 1)]
    : undefined;
}

/** Thrown for an upload that is not an acceptable image; the message is safe to show. */
export class InvalidAssetError extends Error {}

export interface StoredAsset {
  /** `<hash>.<ext>`: the file name under `assets/`, and the last segment of its URL. */
  readonly name: string;
  readonly hash: string;
  readonly contentType: string;
  readonly size: number;
}

const HEADER_BYTES = 12;

function startsWith(bytes: Buffer, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Whether the first bytes of a file are the signature of `extension`. */
function matchesSignature(extension: string, header: Buffer): boolean {
  switch (extension) {
    case 'png':
      return startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg':
      return startsWith(header, [0xff, 0xd8, 0xff]);
    case 'gif':
      return (
        startsWith(header, [0x47, 0x49, 0x46, 0x38]) &&
        (header[4] === 0x37 || header[4] === 0x39) &&
        header[5] === 0x61
      );
    case 'webp':
      return (
        startsWith(header, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(header, [0x57, 0x45, 0x42, 0x50], 8)
      );
    default:
      return false;
  }
}

/**
 * Streams `body` into `assetsDir` as `<hash>.<ext>` and returns what was
 * stored. `contentType` is the request's media type; anything not in
 * `IMAGE_TYPES`, an empty body, or a body whose first bytes do not match the
 * type throws `InvalidAssetError` and leaves nothing behind. Storing a file
 * that already exists just discards the duplicate.
 */
export async function storeAsset(
  assetsDir: string,
  contentType: string,
  body: Readable,
): Promise<StoredAsset> {
  const extension = IMAGE_TYPES[contentType];
  if (extension === undefined) {
    throw new InvalidAssetError(
      `unsupported media type; send one of ${Object.keys(IMAGE_TYPES).join(', ')}`,
    );
  }
  mkdirSync(assetsDir, { recursive: true });

  const hash = createHash('sha256');
  let header: Buffer = Buffer.alloc(0);
  let size = 0;
  const inspect = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (header.length < HEADER_BYTES) {
        header = Buffer.concat([header, chunk]).subarray(0, HEADER_BYTES);
      }
      size += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  const temporary = join(assetsDir, `.upload-${crypto.randomUUID()}`);
  try {
    await pipeline(body, inspect, createWriteStream(temporary));
    if (size === 0) {
      throw new InvalidAssetError('the upload is empty');
    }
    if (!matchesSignature(extension, header)) {
      throw new InvalidAssetError('the file is not a valid image of that type');
    }
    const digest = hash.digest('hex');
    const name = `${digest}.${extension}`;
    const target = join(assetsDir, name);
    if (existsSync(target)) {
      rmSync(temporary, { force: true });
    } else {
      renameSync(temporary, target);
    }
    return { name, hash: digest, contentType, size };
  } catch (caught) {
    rmSync(temporary, { force: true });
    throw caught;
  }
}
