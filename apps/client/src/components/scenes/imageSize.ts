/**
 * How big a picture is, read in the browser before it is uploaded, so a new map's
 * scene can be made exactly that size: one picture pixel is one scene pixel, and
 * the grid lines up with the printed one at the usual 100 px a square. Decoding
 * is the only reliable way to know; the file's bytes are not read again here.
 */

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** Throws if the browser cannot decode `file` as an image. */
export async function readImageSize(file: Blob): Promise<ImageSize> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
